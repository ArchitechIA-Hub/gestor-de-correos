import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { moveToFinanzas, removeFromFinanzas, moveEmailsTo } from "./email-category";

const mockedRequireSession = vi.mocked(requireSession);
let organizationId: string;

async function resetDb() {
  await prisma.whatsAppNotification.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.urgentAlert.deleteMany();
  await prisma.auditLogEntry.deleteMany();
  await prisma.draft.deleteMany();
  await prisma.commitment.deleteMany();
  await prisma.emailAttachment.deleteMany();
  await prisma.email.deleteMany();
  await prisma.sender.deleteMany();
  await prisma.mailAccount.deleteMany();
}

async function seed(count = 1) {
  const account = await prisma.mailAccount.create({
    data: { organizationId, emailAddress: "bbva@test.local", label: "Banco" },
  });
  const sender = await prisma.sender.create({
    data: { organizationId, email: "notificaciones@bbva.test", name: "BBVA" },
  });
  const emails = [];
  for (let i = 0; i < count; i++) {
    emails.push(
      await prisma.email.create({
        data: {
          organizationId,
          senderId: sender.id,
          mailAccountId: account.id,
          threadId: `t${i}`,
          subject: `Movimiento ${i}`,
          rawBody: "cuerpo",
          receivedAt: new Date(),
          status: "CLASSIFIED",
        },
      })
    );
  }
  return { sender, emails };
}

beforeEach(async () => {
  await resetDb();
  const organization = await prisma.organization.create({ data: { name: "Organización de prueba" } });
  organizationId = organization.id;
  mockedRequireSession.mockResolvedValue({ userId: "test-user-id", organizationId });
});

describe("moveToFinanzas", () => {
  it("mueve solo el correo y audita CATEGORIZE", async () => {
    const { sender, emails } = await seed(2);

    await moveToFinanzas(emails[0].id, false);

    expect((await prisma.email.findUniqueOrThrow({ where: { id: emails[0].id } })).category).toBe("FINANZAS");
    expect((await prisma.email.findUniqueOrThrow({ where: { id: emails[1].id } })).category).toBeNull();
    expect((await prisma.sender.findUniqueOrThrow({ where: { id: sender.id } })).autoCategory).toBeNull();

    const entries = await prisma.auditLogEntry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0].actionType).toBe("CATEGORIZE");
    expect(entries[0].performedBy).toBe("USER");
  });

  it("con alsoSender fija la regla y arrastra los demás correos clasificados del remitente", async () => {
    const { sender, emails } = await seed(3);

    await moveToFinanzas(emails[0].id, true);

    expect((await prisma.sender.findUniqueOrThrow({ where: { id: sender.id } })).autoCategory).toBe("FINANZAS");
    const cats = await prisma.email.findMany({ select: { category: true } });
    expect(cats.every((e) => e.category === "FINANZAS")).toBe(true);
  });
});

describe("removeFromFinanzas", () => {
  it("saca el correo de Finanzas; sin alsoClearSenderRule deja la regla", async () => {
    const { sender, emails } = await seed(1);
    await moveToFinanzas(emails[0].id, true);

    await removeFromFinanzas(emails[0].id, false);

    expect((await prisma.email.findUniqueOrThrow({ where: { id: emails[0].id } })).category).toBeNull();
    expect((await prisma.sender.findUniqueOrThrow({ where: { id: sender.id } })).autoCategory).toBe("FINANZAS");
  });

  it("con alsoClearSenderRule quita también la regla del remitente", async () => {
    const { sender, emails } = await seed(1);
    await moveToFinanzas(emails[0].id, true);

    await removeFromFinanzas(emails[0].id, true);

    expect((await prisma.sender.findUniqueOrThrow({ where: { id: sender.id } })).autoCategory).toBeNull();
  });
});

describe("moveEmailsTo (selección múltiple)", () => {
  it("mueve varios correos a finanzas de una y audita cada uno", async () => {
    const { emails } = await seed(3);

    await moveEmailsTo([emails[0].id, emails[1].id], "finanzas");

    const cats = await prisma.email.findMany({ orderBy: { threadId: "asc" }, select: { category: true } });
    expect(cats.map((c) => c.category)).toEqual(["FINANZAS", "FINANZAS", null]);
    expect(await prisma.auditLogEntry.count({ where: { actionType: "CATEGORIZE" } })).toBe(2);
  });

  it("a marketing: archiva y limpia la urgencia; a inbox: vuelve a CLASSIFIED sin categoría", async () => {
    const { emails } = await seed(2);

    await moveEmailsTo([emails[0].id], "marketing");
    let e = await prisma.email.findUniqueOrThrow({ where: { id: emails[0].id } });
    expect(e.status).toBe("ARCHIVED");
    expect(e.isMarketing).toBe(true);

    await moveEmailsTo([emails[0].id], "inbox");
    e = await prisma.email.findUniqueOrThrow({ where: { id: emails[0].id } });
    expect(e.status).toBe("CLASSIFIED");
    expect(e.isMarketing).toBe(false);
    expect(e.category).toBeNull();
  });

  it("no hace nada con lista vacía", async () => {
    await seed(1);
    await moveEmailsTo([], "finanzas");
    expect(await prisma.auditLogEntry.count()).toBe(0);
  });
});

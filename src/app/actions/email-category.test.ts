import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { moveToFinanzas, removeFromFinanzas } from "./email-category";

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
    data: { emailAddress: "bbva@test.local", label: "Banco" },
  });
  const sender = await prisma.sender.create({
    data: { email: "notificaciones@bbva.test", name: "BBVA" },
  });
  const emails = [];
  for (let i = 0; i < count; i++) {
    emails.push(
      await prisma.email.create({
        data: {
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

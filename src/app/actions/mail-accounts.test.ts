import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { renameMailAccount } from "./mail-accounts";

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

async function seedAccount(label = "Cuenta vieja") {
  return prisma.mailAccount.create({
    data: { emailAddress: "cuenta@test.local", label },
  });
}

beforeEach(async () => {
  await resetDb();
});

describe("renameMailAccount", () => {
  it("actualiza el label y registra un evento de auditoría", async () => {
    const account = await seedAccount("Cuenta vieja");

    const updated = await renameMailAccount(account.id, "Personal");

    expect(updated.label).toBe("Personal");

    const entries = await prisma.auditLogEntry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0].actionType).toBe("MANAGE_MAIL_ACCOUNT");
    expect(entries[0].performedBy).toBe("USER");
    expect(JSON.parse(entries[0].payloadBefore!)).toEqual({ label: "Cuenta vieja" });
    expect(JSON.parse(entries[0].payloadAfter!)).toEqual({ label: "Personal" });
  });

  it("recorta espacios", async () => {
    const account = await seedAccount();
    const updated = await renameMailAccount(account.id, "  Trabajo  ");
    expect(updated.label).toBe("Trabajo");
  });

  it("rechaza un nombre vacío sin tocar la cuenta ni la auditoría", async () => {
    const account = await seedAccount("Cuenta vieja");

    await expect(renameMailAccount(account.id, "   ")).rejects.toThrow("La cuenta necesita un nombre.");

    const fresh = await prisma.mailAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(fresh.label).toBe("Cuenta vieja");
    expect(await prisma.auditLogEntry.count()).toBe(0);
  });

  it("no audita si el nombre no cambió", async () => {
    const account = await seedAccount("Personal");
    await renameMailAccount(account.id, "Personal");
    expect(await prisma.auditLogEntry.count()).toBe(0);
  });
});

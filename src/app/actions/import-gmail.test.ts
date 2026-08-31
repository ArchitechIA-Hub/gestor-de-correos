import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const listMock = vi.fn();
vi.mock("@/lib/gmail/client", () => ({
  getGmailClientForAccount: vi.fn(() => ({
    users: { messages: { list: listMock } },
  })),
}));

import { prisma } from "@/lib/db/prisma";
import { importGmailEmails } from "./import-gmail";

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
  await prisma.extraConfig.deleteMany();
}

async function seedGmailAccount() {
  return prisma.mailAccount.create({
    data: {
      emailAddress: "real@gmail.com",
      label: "Gmail real",
      provider: "gmail",
      googleRefreshToken: "fake-refresh-token",
    },
  });
}

beforeEach(async () => {
  await resetDb();
  listMock.mockReset();
  listMock.mockResolvedValue({ data: { messages: [] } });
});

describe("importGmailEmails", () => {
  it("pide a Gmail solo la pestaña Principal (INBOX + CATEGORY_PERSONAL)", async () => {
    const account = await seedGmailAccount();

    await importGmailEmails(account.id);

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock.mock.calls[0][0]).toMatchObject({
      labelIds: ["INBOX", "CATEGORY_PERSONAL"],
    });
  });

  it("rechaza una cuenta que no está conectada a Gmail", async () => {
    const account = await prisma.mailAccount.create({
      data: { emailAddress: "mock@test.local", label: "Cuenta mock" },
    });

    await expect(importGmailEmails(account.id)).rejects.toThrow(
      "Esta cuenta no está conectada a Gmail."
    );
  });
});

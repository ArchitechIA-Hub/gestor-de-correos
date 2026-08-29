import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/gmail/send", () => ({ sendGmailReply: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { sendGmailReply } from "@/lib/gmail/send";
import { approveDraft } from "./approve-draft";

const mockedSendGmailReply = vi.mocked(sendGmailReply);

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

async function seedDraft(accountOverrides: { provider?: string; googleRefreshToken?: string | null } = {}) {
  const account = await prisma.mailAccount.create({
    data: {
      emailAddress: "cuenta@test.local",
      label: "Cuenta de prueba",
      provider: accountOverrides.provider ?? "mock",
      googleRefreshToken: accountOverrides.googleRefreshToken ?? null,
    },
  });
  const sender = await prisma.sender.create({
    data: { email: "remitente@test.local", name: "Remitente de Prueba" },
  });
  const email = await prisma.email.create({
    data: {
      senderId: sender.id,
      mailAccountId: account.id,
      threadId: "thread-1",
      subject: "Asunto de prueba",
      rawBody: "Cuerpo del correo de prueba",
      receivedAt: new Date(),
      status: "CLASSIFIED",
      rfcMessageId: "<original@test.local>",
    },
  });
  const draft = await prisma.draft.create({
    data: {
      emailId: email.id,
      content: "Contenido del borrador",
      status: "PENDING_REVIEW",
      modelUsed: "test-model",
    },
  });
  return { account, sender, email, draft };
}

beforeEach(async () => {
  await resetDb();
  mockedSendGmailReply.mockReset();
});

describe("approveDraft", () => {
  it("cuenta mock: aprueba sin intentar enviar nada real", async () => {
    const { draft, email } = await seedDraft({ provider: "mock" });

    const updated = await approveDraft(draft.id);

    expect(updated.status).toBe("APPROVED");
    expect(mockedSendGmailReply).not.toHaveBeenCalled();

    const updatedEmail = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    expect(updatedEmail.respondedAt).not.toBeNull();

    const auditTypes = (await prisma.auditLogEntry.findMany()).map((a) => a.actionType);
    expect(auditTypes).toEqual(["APPROVE_DRAFT"]);
  });

  it("cuenta gmail: envía de verdad, audita SEND_DRAFT con el payload esperado", async () => {
    const { draft, email, sender } = await seedDraft({ provider: "gmail", googleRefreshToken: "refresh-token" });
    mockedSendGmailReply.mockResolvedValue("sent-message-id-123");

    const updated = await approveDraft(draft.id);

    expect(updated.status).toBe("APPROVED");
    expect(mockedSendGmailReply).toHaveBeenCalledWith({
      mailAccount: expect.objectContaining({ googleRefreshToken: "refresh-token" }),
      to: sender.email,
      subject: email.subject,
      body: draft.content,
      threadId: email.threadId,
      inReplyTo: email.rfcMessageId,
    });

    const auditEntries = await prisma.auditLogEntry.findMany();
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].actionType).toBe("SEND_DRAFT");
    expect(JSON.parse(auditEntries[0].payloadAfter!)).toEqual({
      status: "APPROVED",
      to: sender.email,
      subject: email.subject,
      sentMessageId: "sent-message-id-123",
    });
  });

  it("cuenta gmail: si el envío falla, no aprueba el borrador ni audita nada", async () => {
    const { draft, email } = await seedDraft({ provider: "gmail", googleRefreshToken: "refresh-token" });
    mockedSendGmailReply.mockRejectedValue(new Error("Gmail API error"));

    await expect(approveDraft(draft.id)).rejects.toThrow("Gmail API error");

    const untouchedDraft = await prisma.draft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(untouchedDraft.status).toBe("PENDING_REVIEW");

    const untouchedEmail = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
    expect(untouchedEmail.respondedAt).toBeNull();

    expect(await prisma.auditLogEntry.count()).toBe(0);
  });
});

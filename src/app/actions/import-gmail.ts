"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";
import { getGmailClientForAccount } from "@/lib/gmail/client";
import {
  DEFAULT_GMAIL_IMPORT_LIMIT,
  MAX_GMAIL_IMPORT_LIMIT,
  MIN_GMAIL_IMPORT_LIMIT,
  PRIMARY_INBOX_LABEL_IDS,
} from "@/lib/gmail/constants";
import { parseGmailMessage } from "@/lib/gmail/parse-message";

export type ImportGmailResult = {
  imported: number;
  skipped: number;
};

/**
 * Importa los `limit` correos más recientes de la pestaña **Principal**
 * (Primary) del INBOX real de una cuenta
 * Gmail ya conectada (provider "gmail") como filas `Email` en estado
 * UNCLASSIFIED — el `scan()` existente las recoge en el siguiente ciclo,
 * igual que a los correos mock. No clasifica ni llama a IA aquí.
 */
export async function importGmailEmails(
  mailAccountId: string,
  limit: number = DEFAULT_GMAIL_IMPORT_LIMIT
): Promise<ImportGmailResult> {
  const mailAccount = await prisma.mailAccount.findUniqueOrThrow({ where: { id: mailAccountId } });

  if (mailAccount.provider !== "gmail" || !mailAccount.googleRefreshToken) {
    throw new Error("Esta cuenta no está conectada a Gmail.");
  }

  const requested = Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_GMAIL_IMPORT_LIMIT;
  const clampedLimit = Math.min(MAX_GMAIL_IMPORT_LIMIT, Math.max(MIN_GMAIL_IMPORT_LIMIT, requested));

  const gmail = getGmailClientForAccount(mailAccount);

  const list = await gmail.users.messages.list({
    userId: "me",
    labelIds: [...PRIMARY_INBOX_LABEL_IDS],
    maxResults: clampedLimit,
  });

  const messageIds = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);

  let imported = 0;
  let skipped = 0;

  for (const gmailMessageId of messageIds) {
    const already = await prisma.email.findUnique({ where: { gmailMessageId } });
    if (already) {
      skipped++;
      continue;
    }

    const full = await gmail.users.messages.get({ userId: "me", id: gmailMessageId, format: "full" });
    const parsed = parseGmailMessage(full.data);

    const sender = await prisma.sender.upsert({
      where: { email: parsed.senderEmail },
      create: { email: parsed.senderEmail, name: parsed.senderName },
      update: {},
    });

    const email = await prisma.email.create({
      data: {
        senderId: sender.id,
        mailAccountId: mailAccount.id,
        threadId: full.data.threadId ?? gmailMessageId,
        subject: parsed.subject,
        rawBody: parsed.rawBody,
        receivedAt: parsed.receivedAt,
        gmailMessageId,
        rfcMessageId: parsed.rfcMessageId,
        attachments: {
          create: parsed.attachments.map((a) => ({
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            gmailAttachmentId: a.gmailAttachmentId,
          })),
        },
      },
    });

    await recordAuditEvent({
      actionType: "IMPORT_EMAIL",
      entityType: "Email",
      entityId: email.id,
      payloadAfter: { subject: parsed.subject, from: parsed.senderEmail, gmailMessageId },
      performedBy: "USER",
    });

    imported++;
  }

  revalidatePath("/", "layout");
  revalidatePath("/inbox");
  revalidatePath("/settings/accounts");
  revalidatePath("/audit");

  return { imported, skipped };
}

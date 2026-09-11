"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";
import { getGmailClientForAccount } from "@/lib/gmail/client";
import type { gmail_v1 } from "googleapis";
import type { MailAccountModel } from "@/generated/prisma/models";
import {
  DEFAULT_GMAIL_IMPORT_LIMIT,
  MAX_GMAIL_IMPORT_LIMIT,
  MIN_GMAIL_IMPORT_LIMIT,
  CATCH_UP_PAGE_SIZE,
  CATCH_UP_MAX_PAGES,
  PRIMARY_OR_UPDATES_QUERY,
} from "@/lib/gmail/constants";
import { parseGmailMessage } from "@/lib/gmail/parse-message";
import type { AuditPerformer } from "@/generated/prisma/enums";

export type ImportGmailResult = {
  imported: number;
  skipped: number;
};

/**
 * Crea la fila `Email` (+ remitente, adjuntos, auditoría) para un mensaje de
 * Gmail que todavía no existe en la base. Compartido entre el import manual
 * (con tope fijo) y el catch-up automático (con paginación) para no duplicar
 * la lógica de parseo/creación entre los dos.
 */
async function importSingleGmailMessage(
  mailAccount: Pick<MailAccountModel, "id">,
  gmail: gmail_v1.Gmail,
  gmailMessageId: string,
  performedBy: AuditPerformer
) {
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
    performedBy,
  });
}

/**
 * Importa los `limit` correos más recientes de las pestañas **Principal** y
 * **Actualizaciones** del INBOX real de una cuenta Gmail ya conectada
 * (provider "gmail") como filas `Email` en estado UNCLASSIFIED — el `scan()`
 * existente las recoge en el siguiente ciclo, igual que a los correos mock.
 * No clasifica ni llama a IA aquí. Import manual, iniciado por el usuario
 * desde /settings/accounts.
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
    labelIds: ["INBOX"],
    q: PRIMARY_OR_UPDATES_QUERY,
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

    await importSingleGmailMessage(mailAccount, gmail, gmailMessageId, "USER");
    imported++;
  }

  revalidatePath("/", "layout");
  revalidatePath("/inbox");
  revalidatePath("/settings/accounts");
  revalidatePath("/audit");

  return { imported, skipped };
}

/**
 * Import "de ponerse al día" para el ciclo automático (`/api/scan`): pide los
 * mensajes de Gmail de más reciente a más antiguo, página por página, y para
 * en cuanto encuentra el primer `gmailMessageId` que ya existe en la base —
 * todo lo que sigue de ahí (más antiguo) ya se importó en un ciclo anterior,
 * así que no hace falta seguir pidiendo páginas.
 *
 * A diferencia de `importGmailEmails`, no tiene un tope fijo de mensajes: en
 * uso normal (ciclos cada 15min-6h de UN buzón real) el hueco entre ciclos es
 * chico y esto termina en la primera página. `CATCH_UP_MAX_PAGES` es solo un
 * circuito de seguridad contra un bug de paginación, no un límite de costo —
 * si se llega a ese tope sin encontrar un mensaje conocido (backlog inicial
 * enorme, o mucho tiempo sin correr), se avisa por log en vez de quedar
 * atascado para siempre: el próximo ciclo retoma desde la página 1 y avanza
 * un poco más, hasta cerrar el hueco en varias pasadas.
 */
export async function importNewGmailEmails(mailAccountId: string): Promise<ImportGmailResult> {
  const mailAccount = await prisma.mailAccount.findUniqueOrThrow({ where: { id: mailAccountId } });

  if (mailAccount.provider !== "gmail" || !mailAccount.googleRefreshToken) {
    throw new Error("Esta cuenta no está conectada a Gmail.");
  }

  const gmail = getGmailClientForAccount(mailAccount);

  let imported = 0;
  let skipped = 0;
  let pageToken: string | undefined;
  let reachedKnownMessage = false;

  for (let page = 0; page < CATCH_UP_MAX_PAGES; page++) {
    const list = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: PRIMARY_OR_UPDATES_QUERY,
      maxResults: CATCH_UP_PAGE_SIZE,
      pageToken,
    });

    const messageIds = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);
    if (messageIds.length === 0) break;

    for (const gmailMessageId of messageIds) {
      const already = await prisma.email.findUnique({ where: { gmailMessageId } });
      if (already) {
        skipped++;
        reachedKnownMessage = true;
        break;
      }

      await importSingleGmailMessage(mailAccount, gmail, gmailMessageId, "SYSTEM");
      imported++;
    }

    if (reachedKnownMessage) break;

    pageToken = list.data.nextPageToken ?? undefined;
    if (!pageToken) break;

    if (page === CATCH_UP_MAX_PAGES - 1) {
      console.warn(
        `[import] catch-up para ${mailAccount.emailAddress} llegó al tope de ${CATCH_UP_MAX_PAGES} páginas sin encontrar un correo ya importado — puede quedar backlog más antiguo por traer, el próximo ciclo sigue avanzando.`
      );
    }
  }

  if (imported > 0) {
    revalidatePath("/", "layout");
    revalidatePath("/inbox");
    revalidatePath("/settings/accounts");
    revalidatePath("/audit");
  }

  return { imported, skipped };
}

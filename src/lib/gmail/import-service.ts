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
import { describeGoogleApiError } from "@/lib/gmail/errors";
import type { AuditPerformer } from "@/generated/prisma/enums";

export type ImportGmailResult = {
  imported: number;
  skipped: number;
};

/**
 * Lógica real del import de Gmail, extraída de `src/app/actions/import-gmail.ts`
 * (que sigue siendo el Server Action que llama la UI) para que también la
 * pueda usar `/api/scan/route.ts` (el scheduler) sin pasar por un Server
 * Action — mismo motivo que `src/lib/scan/run-cycle.ts`: `organizationId`
 * nunca debe llegar como parámetro confiable de un Server Action invocable
 * desde el cliente, y aquí además se usa para verificar que `mailAccountId`
 * de verdad pertenece a esa organización antes de tocar nada.
 */
async function getOwnedGmailAccount(organizationId: string, mailAccountId: string) {
  const mailAccount = await prisma.mailAccount.findFirstOrThrow({ where: { id: mailAccountId, organizationId } });
  if (mailAccount.provider !== "gmail" || !mailAccount.googleRefreshToken) {
    throw new Error("Esta cuenta no está conectada a Gmail.");
  }
  return mailAccount;
}

async function importSingleGmailMessage(
  organizationId: string,
  mailAccount: Pick<MailAccountModel, "id">,
  gmail: gmail_v1.Gmail,
  gmailMessageId: string,
  performedBy: AuditPerformer
) {
  const full = await gmail.users.messages.get({ userId: "me", id: gmailMessageId, format: "full" });
  const parsed = parseGmailMessage(full.data);

  const sender = await prisma.sender.upsert({
    where: { organizationId_email: { organizationId, email: parsed.senderEmail } },
    create: { organizationId, email: parsed.senderEmail, name: parsed.senderName },
    update: {},
  });

  const email = await prisma.email.create({
    data: {
      organizationId,
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
    organizationId,
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
export async function importGmailEmailsForAccount(
  organizationId: string,
  mailAccountId: string,
  limit: number = DEFAULT_GMAIL_IMPORT_LIMIT
): Promise<ImportGmailResult> {
  const mailAccount = await getOwnedGmailAccount(organizationId, mailAccountId);

  const requested = Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_GMAIL_IMPORT_LIMIT;
  const clampedLimit = Math.min(MAX_GMAIL_IMPORT_LIMIT, Math.max(MIN_GMAIL_IMPORT_LIMIT, requested));

  const gmail = getGmailClientForAccount(mailAccount);

  let imported = 0;
  let skipped = 0;

  try {
    const list = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: PRIMARY_OR_UPDATES_QUERY,
      maxResults: clampedLimit,
    });

    const messageIds = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);

    for (const gmailMessageId of messageIds) {
      const already = await prisma.email.findUnique({ where: { gmailMessageId } });
      if (already) {
        skipped++;
        continue;
      }

      await importSingleGmailMessage(organizationId, mailAccount, gmail, gmailMessageId, "USER");
      imported++;
    }
  } catch (error) {
    // No relanzar el error de gaxios/googleapis tal cual: trae el cuerpo
    // crudo de la request (incluido el refresh_token) — ver
    // src/lib/gmail/errors.ts.
    throw new Error(describeGoogleApiError(error));
  }

  return { imported, skipped };
}

/**
 * Import "de ponerse al día" para el ciclo automático (`/api/scan`): pide los
 * mensajes de Gmail de más reciente a más antiguo, página por página, y para
 * en cuanto encuentra el primer `gmailMessageId` que ya existe en la base —
 * todo lo que sigue de ahí (más antiguo) ya se importó en un ciclo anterior,
 * así que no hace falta seguir pidiendo páginas.
 *
 * A diferencia de `importGmailEmailsForAccount`, no tiene un tope fijo de
 * mensajes: en uso normal (ciclos cada 15min-6h de UN buzón real) el hueco
 * entre ciclos es chico y esto termina en la primera página.
 * `CATCH_UP_MAX_PAGES` es solo un circuito de seguridad contra un bug de
 * paginación, no un límite de costo — si se llega a ese tope sin encontrar un
 * mensaje conocido (backlog inicial enorme, o mucho tiempo sin correr), se
 * avisa por log en vez de quedar atascado para siempre: el próximo ciclo
 * retoma desde la página 1 y avanza un poco más, hasta cerrar el hueco en
 * varias pasadas.
 */
export async function importNewGmailEmailsForAccount(
  organizationId: string,
  mailAccountId: string
): Promise<ImportGmailResult> {
  const mailAccount = await getOwnedGmailAccount(organizationId, mailAccountId);
  const gmail = getGmailClientForAccount(mailAccount);

  let imported = 0;
  let skipped = 0;

  try {
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

        await importSingleGmailMessage(organizationId, mailAccount, gmail, gmailMessageId, "SYSTEM");
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
  } catch (error) {
    // No relanzar el error de gaxios/googleapis tal cual: trae el cuerpo
    // crudo de la request (incluido el refresh_token) — ver
    // src/lib/gmail/errors.ts.
    throw new Error(describeGoogleApiError(error));
  }

  return { imported, skipped };
}

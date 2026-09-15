import { prisma } from "@/lib/db/prisma";
import { getAppSettings, getUserTimeZone } from "@/lib/settings";
import { recordAuditEvent } from "@/lib/audit/record";
import { getDigestData, type DigestRange } from "@/lib/digest/get-digest-data";
import { renderDigestEmailHtml } from "@/lib/digest/render-email-html";
import { sendGmailMessage } from "@/lib/gmail/send";
import { describeGoogleApiError } from "@/lib/gmail/errors";
import type { AuditPerformer } from "@/generated/prisma/enums";

/**
 * Lógica real de envío del Informe, extraída de `src/app/actions/send-digest.ts`
 * (que sigue siendo el Server Action que llama la UI) para que también la
 * pueda usar `/api/send-digest/route.ts` (el scheduler, iterando
 * organizaciones) sin pasar por un Server Action — mismo motivo que
 * `src/lib/scan/run-cycle.ts`: `organizationId` nunca debe llegar como
 * parámetro confiable de un Server Action invocable desde el cliente.
 */
export async function sendDigestForOrganization(
  organizationId: string,
  range: DigestRange,
  performedBy: AuditPerformer
) {
  const settings = await getAppSettings(organizationId);
  if (!settings.digestRecipientEmail) {
    throw new Error("No hay un destinatario configurado para el digest.");
  }

  const mailAccount = await prisma.mailAccount.findFirst({
    where: { organizationId, provider: "gmail", isActive: true, googleRefreshToken: { not: null } },
  });
  if (!mailAccount) {
    throw new Error("No hay ninguna cuenta de Gmail conectada para enviar el informe.");
  }

  const [data, timeZone, organization] = await Promise.all([
    getDigestData(organizationId, range),
    getUserTimeZone(organizationId),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
  ]);
  // El "usuario" del Informe es la organización (la persona/cuenta cuya
  // bandeja se gestiona), no quien esté logueado en ese momento — así el
  // Informe se ve igual sin importar cuál de las personas de la
  // organización lo haya disparado o si lo envió el scheduler automático.
  const html = renderDigestEmailHtml(data, timeZone, organization.name);
  const subject = `Informe ${range === "weekly" ? "semanal" : "diario"} de ${organization.name}`;

  let gmailMessageId: string;
  try {
    gmailMessageId = await sendGmailMessage({
      mailAccount,
      to: settings.digestRecipientEmail,
      subject,
      html,
    });
  } catch (error) {
    // No relanzar el error de gaxios/googleapis tal cual — ver
    // src/lib/gmail/errors.ts.
    throw new Error(describeGoogleApiError(error));
  }

  const sentAt = new Date();

  await recordAuditEvent({
    organizationId,
    actionType: "SEND_DIGEST",
    entityType: "Digest",
    entityId: `${range}-${sentAt.toISOString()}`,
    payloadAfter: {
      recipientEmail: settings.digestRecipientEmail,
      range,
      rangeStart: data.rangeStart,
      rangeEnd: data.rangeEnd,
      emailsInRange: data.emails.length,
      activeCommitments: data.activeCommitments,
      overdueCommitments: data.overdueCommitments,
      gmailMessageId,
    },
    performedBy,
    reversible: false,
  });

  return { sentAt, recipientEmail: settings.digestRecipientEmail };
}

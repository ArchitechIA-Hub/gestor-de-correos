"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getAppSettings, getUserTimeZone } from "@/lib/settings";
import { recordAuditEvent } from "@/lib/audit/record";
import { getDigestData, type DigestRange } from "@/lib/digest/get-digest-data";
import { renderDigestEmailHtml } from "@/lib/digest/render-email-html";
import { sendGmailMessage } from "@/lib/gmail/send";
import { describeGoogleApiError } from "@/lib/gmail/errors";
import { CURRENT_USER_NAME } from "@/lib/config";
import type { AuditPerformer } from "@/generated/prisma/enums";

export type SendDigestInput = {
  range: DigestRange;
};

/**
 * Envía el Informe (digest) real por correo vía Gmail (`gmail.send`, ya
 * autorizado — se usa igual para respuestas de borradores). `performedBy`
 * distingue el envío manual desde el botón (USER, con confirmación explícita
 * en la UI) del ciclo automático semanal (SYSTEM, ver
 * src/lib/scheduler/auto-digest.ts) — ambos quedan auditados igual.
 */
export async function sendDigest(input: SendDigestInput, performedBy: AuditPerformer = "USER") {
  const settings = await getAppSettings();
  if (!settings.digestRecipientEmail) {
    throw new Error("No hay un destinatario configurado para el digest.");
  }

  const mailAccount = await prisma.mailAccount.findFirst({
    where: { provider: "gmail", isActive: true, googleRefreshToken: { not: null } },
  });
  if (!mailAccount) {
    throw new Error("No hay ninguna cuenta de Gmail conectada para enviar el informe.");
  }

  const [data, timeZone] = await Promise.all([getDigestData(input.range), getUserTimeZone()]);
  const html = renderDigestEmailHtml(data, timeZone);
  const subject = `Informe ${input.range === "weekly" ? "semanal" : "diario"} de ${CURRENT_USER_NAME}`;

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
    actionType: "SEND_DIGEST",
    entityType: "Digest",
    entityId: `${input.range}-${sentAt.toISOString()}`,
    payloadAfter: {
      recipientEmail: settings.digestRecipientEmail,
      range: input.range,
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

  revalidatePath("/audit");

  return { sentAt, recipientEmail: settings.digestRecipientEmail };
}

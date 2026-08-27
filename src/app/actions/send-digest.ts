"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getAppSettings } from "@/lib/settings";
import { recordAuditEvent } from "@/lib/audit/record";

export type SendDigestInput = {
  range: "daily" | "weekly";
};

/**
 * Simula el envío del digest: no hay proveedor de correo real conectado en
 * este prototipo (decisión de alcance para el MVP), así que esta acción
 * registra el envío como una acción auditable en vez de despachar un correo
 * de verdad. Requiere que el usuario haya confirmado explícitamente (el
 * diálogo de confirmación en la UI cumple la regla de "acción irreversible
 * requiere confirmación humana antes de ejecutarse").
 */
export async function sendDigest(input: SendDigestInput) {
  const settings = await getAppSettings();
  if (!settings.digestRecipientEmail) {
    throw new Error("No hay un destinatario configurado para el digest.");
  }

  const rangeStart = new Date(Date.now() - (input.range === "weekly" ? 7 : 1) * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date();

  const [emailsInRange, activeCommitments, overdueCommitments] = await Promise.all([
    prisma.email.count({ where: { receivedAt: { gte: rangeStart, lte: rangeEnd }, isMarketing: false } }),
    prisma.commitment.count({ where: { status: "PENDING" } }),
    prisma.commitment.count({ where: { status: "OVERDUE" } }),
  ]);

  const sentAt = new Date();

  await recordAuditEvent({
    actionType: "SEND_DIGEST",
    entityType: "Digest",
    entityId: `${input.range}-${sentAt.toISOString()}`,
    payloadAfter: {
      recipientEmail: settings.digestRecipientEmail,
      range: input.range,
      rangeStart,
      rangeEnd,
      emailsInRange,
      activeCommitments,
      overdueCommitments,
    },
    performedBy: "USER",
    reversible: false,
  });

  revalidatePath("/audit");

  return { sentAt, recipientEmail: settings.digestRecipientEmail };
}

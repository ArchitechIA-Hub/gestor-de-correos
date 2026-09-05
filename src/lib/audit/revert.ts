import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "./record";
import { recomputeEmailPriority } from "@/lib/priority/recompute-email";

export class AuditRevertError extends Error {}

/**
 * Reversión centralizada de acciones automáticas. La lógica inversa depende
 * del actionType original; el propio revert también queda auditado.
 */
export async function revertAuditEvent(auditLogEntryId: string) {
  const entry = await prisma.auditLogEntry.findUnique({ where: { id: auditLogEntryId } });
  if (!entry) throw new AuditRevertError("Entrada de auditoría no encontrada.");
  if (!entry.reversible) throw new AuditRevertError("Esta acción no es reversible.");
  if (entry.revertedAt) throw new AuditRevertError("Esta acción ya fue revertida.");

  const before = entry.payloadBefore ? JSON.parse(entry.payloadBefore) : null;

  switch (entry.actionType) {
    case "CLASSIFY":
    case "MARK_URGENT":
    case "MARK_MARKETING":
    case "CATEGORIZE": {
      // Restaura el estado del correo. NO revierte Sender.autoCategory ni el
      // backfill de "…y siempre este remitente" — eso se quita con "Sacar de
      // Finanzas" + "quitar la regla".
      if (before) {
        await prisma.email.update({ where: { id: entry.entityId }, data: before });
      }
      break;
    }
    case "MANAGE_MAIL_ACCOUNT": {
      if (before) {
        await prisma.mailAccount.update({ where: { id: entry.entityId }, data: before });
      }
      break;
    }
    case "GENERATE_DRAFT": {
      await prisma.draft.update({ where: { id: entry.entityId }, data: { status: "DISCARDED" } });
      break;
    }
    case "CREATE_CALENDAR_EVENT": {
      await prisma.calendarEvent.deleteMany({ where: { auditLogEntryId: entry.id } });
      break;
    }
    case "CREATE_URGENT_ALERT": {
      await prisma.urgentAlert.deleteMany({ where: { id: entry.entityId } });
      break;
    }
    case "SEND_WHATSAPP_NOTIFICATION": {
      await prisma.whatsAppNotification.deleteMany({ where: { id: entry.entityId } });
      break;
    }
    case "DETECT_COMMITMENT": {
      const cancelled = await prisma.commitment.update({
        where: { id: entry.entityId },
        data: { status: "CANCELLED" },
      });
      await recomputeEmailPriority(cancelled.emailId);
      break;
    }
    case "UPDATE_COMMITMENT_STATUS": {
      if (before) {
        const restored = await prisma.commitment.update({ where: { id: entry.entityId }, data: before });
        await recomputeEmailPriority(restored.emailId);
      }
      break;
    }
    default:
      throw new AuditRevertError(`No hay lógica de reversión definida para ${entry.actionType}.`);
  }

  await prisma.auditLogEntry.update({ where: { id: entry.id }, data: { revertedAt: new Date() } });

  await recordAuditEvent({
    actionType: "REVERT",
    entityType: entry.entityType,
    entityId: entry.entityId,
    payloadBefore: entry.payloadAfter ? JSON.parse(entry.payloadAfter) : null,
    payloadAfter: before,
    performedBy: "USER",
    reversible: false,
  });
}

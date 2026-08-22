import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "./record";

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
    case "MARK_URGENT": {
      if (before) {
        await prisma.email.update({ where: { id: entry.entityId }, data: before });
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
    case "DETECT_COMMITMENT": {
      await prisma.commitment.update({ where: { id: entry.entityId }, data: { status: "CANCELLED" } });
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

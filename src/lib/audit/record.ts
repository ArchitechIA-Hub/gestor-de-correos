import { prisma } from "@/lib/db/prisma";
import type { AuditActionType, AuditPerformer } from "@/generated/prisma/enums";

export type RecordAuditEventInput = {
  actionType: AuditActionType;
  entityType: string;
  entityId: string;
  payloadBefore?: unknown;
  payloadAfter?: unknown;
  performedBy?: AuditPerformer;
  reversible?: boolean;
};

/**
 * Único punto de escritura del log de auditoría. Todo módulo que ejecute una
 * acción automática (priorización, IA, mocks de calendario/WhatsApp) debe
 * pasar por aquí — la UI nunca escribe auditoría directamente.
 */
export async function recordAuditEvent(input: RecordAuditEventInput) {
  return prisma.auditLogEntry.create({
    data: {
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId,
      payloadBefore: input.payloadBefore !== undefined ? JSON.stringify(input.payloadBefore) : null,
      payloadAfter: input.payloadAfter !== undefined ? JSON.stringify(input.payloadAfter) : null,
      performedBy: input.performedBy ?? "SYSTEM",
      reversible: input.reversible ?? true,
    },
  });
}

import { prisma } from "@/lib/db/prisma";
import type { AuditActionType, AuditPerformer } from "@/generated/prisma/enums";

export type RecordAuditEventInput = {
  organizationId: string;
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
 * `organizationId` es obligatorio: sin él, /audit y revertAuditEvent no
 * podrían distinguir a qué tenant pertenece cada entrada.
 */
export async function recordAuditEvent(input: RecordAuditEventInput) {
  return prisma.auditLogEntry.create({
    data: {
      organizationId: input.organizationId,
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

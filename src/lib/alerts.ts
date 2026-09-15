import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";

/**
 * Crea la alerta push in-app para un correo que acaba de quedar urgente
 * (<48h). Se llama siempre desde scan.ts junto al evento MARK_URGENT — nunca
 * gateada por el feature `urgentPushAlerts` de la tabla de niveles, porque el
 * invariante de CLAUDE.md dice que la notificación se dispara "sin importar
 * el nivel de servicio calculado (incluso en Nivel 1)".
 */
export async function createUrgentAlert(params: {
  organizationId: string;
  emailId: string;
  subject: string;
  senderName: string;
  commitmentId?: string;
  dueAt: Date | null;
}) {
  const alert = await prisma.urgentAlert.create({
    data: {
      organizationId: params.organizationId,
      emailId: params.emailId,
      commitmentId: params.commitmentId,
      dueAt: params.dueAt,
      message: `${params.senderName}: "${params.subject}" vence en menos de 48h`,
    },
  });

  await recordAuditEvent({
    organizationId: params.organizationId,
    actionType: "CREATE_URGENT_ALERT",
    entityType: "UrgentAlert",
    entityId: alert.id,
    payloadAfter: { emailId: params.emailId, commitmentId: params.commitmentId, dueAt: params.dueAt },
  });

  return alert;
}

export async function getUnreadUrgentAlerts(organizationId: string, limit = 20) {
  return prisma.urgentAlert.findMany({
    where: { organizationId, readAt: null },
    include: { email: { include: { sender: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countUnreadUrgentAlerts(organizationId: string) {
  return prisma.urgentAlert.count({ where: { organizationId, readAt: null } });
}

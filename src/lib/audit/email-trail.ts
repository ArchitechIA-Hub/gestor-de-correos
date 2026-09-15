import { prisma } from "@/lib/db/prisma";

/**
 * Historial de auditoría de un correo: todas las entradas del log que tocan el
 * propio correo o cualquiera de sus entidades derivadas (compromisos,
 * borradores, alertas push, notificaciones de WhatsApp). Los `entityId` son
 * cuids únicos, así que basta con filtrar por id sin mirar el `entityType`.
 */
export async function getEmailAuditTrail(organizationId: string, emailId: string) {
  const email = await prisma.email.findFirst({
    where: { id: emailId, organizationId },
    select: {
      id: true,
      commitments: { select: { id: true, whatsAppNotifications: { select: { id: true } } } },
      drafts: { select: { id: true } },
      urgentAlerts: { select: { id: true } },
    },
  });
  if (!email) return [];

  const ids = [
    email.id,
    ...email.commitments.map((c) => c.id),
    ...email.commitments.flatMap((c) => c.whatsAppNotifications.map((n) => n.id)),
    ...email.drafts.map((d) => d.id),
    ...email.urgentAlerts.map((a) => a.id),
  ];

  return prisma.auditLogEntry.findMany({
    where: { organizationId, entityId: { in: ids } },
    orderBy: { createdAt: "asc" },
  });
}

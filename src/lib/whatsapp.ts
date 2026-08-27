import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";

/**
 * Envía (mock, sin API real de WhatsApp Business) la notificación de un
 * correo crítico. Se llama desde scan.ts junto a MARK_URGENT/createUrgentAlert,
 * solo si el extra "Integración con WhatsApp" está activo — a diferencia de
 * las alertas push in-app, esto NO está cubierto por el invariante de
 * urgencia <48h, así que sí respeta el gating por extra (mismo criterio que
 * el calendario, ver decision-calendario-real en memoria).
 */
export async function sendWhatsAppNotification(params: { commitmentId: string; message: string }) {
  const notification = await prisma.whatsAppNotification.create({
    data: { commitmentId: params.commitmentId, message: params.message },
  });

  await recordAuditEvent({
    actionType: "SEND_WHATSAPP_NOTIFICATION",
    entityType: "WhatsAppNotification",
    entityId: notification.id,
    payloadAfter: { commitmentId: params.commitmentId, message: params.message },
  });

  return notification;
}

export async function getRecentWhatsAppNotifications(limit = 10) {
  return prisma.whatsAppNotification.findMany({
    include: { commitment: { include: { email: { include: { sender: true } } } } },
    orderBy: { sentAt: "desc" },
    take: limit,
  });
}

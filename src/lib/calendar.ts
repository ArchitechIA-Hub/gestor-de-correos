import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";

/**
 * Crea el evento de calendario para un compromiso recién detectado. Se llama
 * desde scan.ts justo después de DETECT_COMMITMENT, solo si el extra
 * "Integración con calendario" está activo (a diferencia de las alertas
 * push, esto NO está cubierto por el invariante de urgencia <48h, así que sí
 * respeta el gating por extra). Sin proveedor real conectado (mismo caso que
 * WhatsApp), "provider" queda como mock.
 */
export async function createCalendarEvent(params: { commitmentId: string; title: string; start: Date }) {
  const auditEntry = await recordAuditEvent({
    actionType: "CREATE_CALENDAR_EVENT",
    entityType: "Commitment",
    entityId: params.commitmentId,
    payloadAfter: { title: params.title, start: params.start },
  });

  return prisma.calendarEvent.create({
    data: {
      commitmentId: params.commitmentId,
      title: params.title,
      start: params.start,
      provider: "mock",
      auditLogEntryId: auditEntry.id,
    },
  });
}

export async function getUpcomingCalendarEvents(limit = 10) {
  return prisma.calendarEvent.findMany({
    where: { start: { gte: new Date() } },
    include: { commitment: { include: { email: { include: { sender: true } } } } },
    orderBy: { start: "asc" },
    take: limit,
  });
}

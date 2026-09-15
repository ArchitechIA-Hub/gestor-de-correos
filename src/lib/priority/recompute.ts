import { prisma } from "@/lib/db/prisma";
import { computePriorityScore, isUrgentByDeadline } from "./engine";
import { recordAuditEvent } from "@/lib/audit/record";
import { createUrgentAlert } from "@/lib/alerts";
import { sendWhatsAppNotification } from "@/lib/whatsapp";
import { getExtraConfig } from "@/lib/extras";

/**
 * Recálculo periódico de correos ya clasificados con un compromiso abierto
 * (PENDING/OVERDUE): nada más lo dispara con el paso del tiempo (el score se
 * escribe una sola vez en scan() y solo se vuelve a tocar como efecto
 * secundario de acciones explícitas del usuario). Sin esto, un compromiso que
 * vence sin que el usuario haga nada se queda marcado "urgente" para siempre.
 * Se llama desde el ciclo del scheduler (src/lib/scheduler/auto-scan.ts).
 *
 * Solo escribe (y audita) los correos cuyo `isUrgent` realmente cambió, para
 * no generar ruido de auditoría por variaciones de score que no cambian nada
 * visible para el usuario. Cuando `isUrgent` pasa de false a true, dispara
 * también la alerta push (y WhatsApp si el extra está activo) — antes esto
 * solo pasaba en `run-cycle.ts` al clasificar por primera vez, así que un
 * compromiso que se volvía urgente por el simple paso del tiempo nunca
 * notificaba al usuario, aunque el invariante de CLAUDE.md ("dispara
 * notificación inmediata... incluso en Nivel 1") no distingue el motivo.
 */
export async function recomputeOpenCommitmentPriorities(
  organizationId: string,
  now: Date = new Date()
): Promise<{ updated: number }> {
  const extraConfig = await getExtraConfig(organizationId);
  const emails = await prisma.email.findMany({
    where: {
      organizationId,
      status: "CLASSIFIED",
      commitments: { some: { status: { in: ["PENDING", "OVERDUE"] } } },
    },
    include: {
      sender: true,
      commitments: {
        where: { status: { in: ["PENDING", "OVERDUE"] } },
        orderBy: { dueAt: { sort: "asc", nulls: "last" } },
        take: 1,
      },
    },
  });

  let updated = 0;

  for (const email of emails) {
    const nearestDueAt = email.commitments[0]?.dueAt ?? null;
    const priorityScore = computePriorityScore(
      { id: email.id, receivedAt: email.receivedAt, isVip: email.sender.isVip, nearestDueAt },
      now
    );
    const isUrgent = isUrgentByDeadline(nearestDueAt, now);

    if (isUrgent === email.isUrgent && priorityScore === email.priorityScore) continue;

    const before = { priorityScore: email.priorityScore, isUrgent: email.isUrgent };
    await prisma.email.update({ where: { id: email.id }, data: { priorityScore, isUrgent } });
    updated++;

    if (isUrgent !== email.isUrgent) {
      await recordAuditEvent({
        organizationId,
        actionType: "CLASSIFY",
        entityType: "Email",
        entityId: email.id,
        payloadBefore: before,
        payloadAfter: { priorityScore, isUrgent, reason: "recálculo periódico por paso del tiempo" },
        performedBy: "SYSTEM",
      });

      // Solo al pasar a urgente (no al dejar de serlo, ver decision de que el
      // peso de urgencia cae a 0 sin alerta nueva) — mismo patrón que
      // run-cycle.ts al clasificar por primera vez.
      if (isUrgent) {
        const nearestCommitment = email.commitments[0] ?? null;

        await recordAuditEvent({
          organizationId,
          actionType: "MARK_URGENT",
          entityType: "Email",
          entityId: email.id,
          payloadBefore: { isUrgent: false },
          payloadAfter: { isUrgent: true, reason: "vencimiento <48h (recálculo periódico)" },
        });

        await createUrgentAlert({
          organizationId,
          emailId: email.id,
          subject: email.subject,
          senderName: email.sender.name,
          commitmentId: nearestCommitment?.id,
          dueAt: nearestDueAt,
        });

        if (extraConfig.whatsappEnabled && nearestCommitment) {
          await sendWhatsAppNotification({
            organizationId,
            commitmentId: nearestCommitment.id,
            message: `${email.sender.name}: "${email.subject}" vence en menos de 48h`,
          });
        }
      }
    }
  }

  return { updated };
}

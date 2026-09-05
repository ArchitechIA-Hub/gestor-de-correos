import { prisma } from "@/lib/db/prisma";
import { computePriorityScore, isUrgentByDeadline } from "./engine";
import { getNearestOpenCommitment } from "./nearest-commitment";

/**
 * Recalcula y persiste `priorityScore`/`isUrgent` de un correo a partir de su
 * compromiso abierto más próximo. Reusar esto en cualquier acción que cambie
 * el estado de un compromiso (marcar cumplido/cancelado, revertir) sin mover
 * el correo de bucket — para que la bandeja priorizada nunca quede con un
 * score/urgencia obsoletos.
 */
export async function recomputeEmailPriority(emailId: string, now: Date = new Date()) {
  const email = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    include: { sender: true },
  });

  const nearest = await getNearestOpenCommitment(emailId);
  const nearestDueAt = nearest?.dueAt ?? null;

  const priorityScore = computePriorityScore(
    { id: email.id, receivedAt: email.receivedAt, isVip: email.sender.isVip, nearestDueAt },
    now
  );
  const isUrgent = isUrgentByDeadline(nearestDueAt, now);

  await prisma.email.update({ where: { id: emailId }, data: { priorityScore, isUrgent } });

  return { priorityScore, isUrgent };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { computePriorityScore, isUrgentByDeadline } from "@/lib/priority/engine";
import { recordAuditEvent } from "@/lib/audit/record";

/**
 * Corrección manual de un falso positivo de marketing: devuelve el correo a
 * la bandeja priorizada. Como los correos de marketing no generan
 * compromisos durante el scan, la prioridad se recalcula sin compromiso
 * cercano (nearestDueAt: null).
 */
export async function unmarkMarketing(emailId: string) {
  const email = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    include: { sender: true },
  });

  const now = new Date();
  const before = { status: email.status, priorityScore: email.priorityScore, isUrgent: email.isUrgent, isMarketing: email.isMarketing };

  const priorityScore = computePriorityScore(
    { id: email.id, receivedAt: email.receivedAt, isVip: email.sender.isVip, nearestDueAt: null },
    now
  );
  const isUrgent = isUrgentByDeadline(null, now);
  const after = { status: "CLASSIFIED" as const, isMarketing: false, marketingReason: null, priorityScore, isUrgent };

  await prisma.email.update({ where: { id: emailId }, data: after });

  await recordAuditEvent({
    actionType: "CLASSIFY",
    entityType: "Email",
    entityId: emailId,
    payloadBefore: before,
    payloadAfter: after,
    performedBy: "USER",
  });

  revalidatePath("/inbox");
  revalidatePath("/digest");
  revalidatePath("/audit");
}

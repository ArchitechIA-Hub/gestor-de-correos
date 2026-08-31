"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { computePriorityScore, isUrgentByDeadline } from "@/lib/priority/engine";
import { recordAuditEvent } from "@/lib/audit/record";
import { EMAIL_CATEGORY_FINANZAS } from "@/lib/scan/constants";

function revalidate() {
  revalidatePath("/inbox");
  revalidatePath("/digest");
  revalidatePath("/audit");
}

async function nearestDueAt(emailId: string): Promise<Date | null> {
  const c = await prisma.commitment.findFirst({
    where: { emailId, status: { in: ["PENDING", "OVERDUE"] }, dueAt: { not: null } },
    orderBy: { dueAt: "asc" },
  });
  return c?.dueAt ?? null;
}

/**
 * Mueve un correo a la vista "Finanzas". Si `alsoSender`, además fija la regla
 * `Sender.autoCategory` y arrastra los otros correos ya clasificados de ese
 * remitente (para que la bandeja quede limpia de inmediato).
 */
export async function moveToFinanzas(emailId: string, alsoSender = false) {
  const email = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    include: { sender: true },
  });

  const now = new Date();
  const before = {
    status: email.status,
    category: email.category,
    isMarketing: email.isMarketing,
    priorityScore: email.priorityScore,
    isUrgent: email.isUrgent,
  };

  const due = email.status === "ARCHIVED" ? null : await nearestDueAt(emailId);
  const priorityScore = computePriorityScore(
    { id: email.id, receivedAt: email.receivedAt, isVip: email.sender.isVip, nearestDueAt: due },
    now
  );
  const isUrgent = isUrgentByDeadline(due, now);

  await prisma.email.update({
    where: { id: emailId },
    data: {
      category: EMAIL_CATEGORY_FINANZAS,
      status: "CLASSIFIED",
      isMarketing: false,
      marketingReason: null,
      priorityScore,
      isUrgent,
    },
  });

  let backfilled = 0;
  if (alsoSender) {
    await prisma.sender.update({ where: { id: email.senderId }, data: { autoCategory: EMAIL_CATEGORY_FINANZAS } });
    const res = await prisma.email.updateMany({
      where: { senderId: email.senderId, status: "CLASSIFIED", category: null },
      data: { category: EMAIL_CATEGORY_FINANZAS, isMarketing: false, marketingReason: null },
    });
    backfilled = res.count;
  }

  await recordAuditEvent({
    actionType: "CATEGORIZE",
    entityType: "Email",
    entityId: emailId,
    payloadBefore: before,
    payloadAfter: { category: EMAIL_CATEGORY_FINANZAS, alsoSender, backfilled },
    performedBy: "USER",
  });

  revalidate();
}

/**
 * Saca un correo de "Finanzas" y lo devuelve a la bandeja priorizada. Si
 * `alsoClearSenderRule`, además quita la regla fija del remitente.
 */
export async function removeFromFinanzas(emailId: string, alsoClearSenderRule = false) {
  const email = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    include: { sender: true },
  });

  const now = new Date();
  const before = { category: email.category, priorityScore: email.priorityScore, isUrgent: email.isUrgent };

  const due = await nearestDueAt(emailId);
  const priorityScore = computePriorityScore(
    { id: email.id, receivedAt: email.receivedAt, isVip: email.sender.isVip, nearestDueAt: due },
    now
  );
  const isUrgent = isUrgentByDeadline(due, now);

  await prisma.email.update({
    where: { id: emailId },
    data: { category: null, priorityScore, isUrgent },
  });

  if (alsoClearSenderRule) {
    await prisma.sender.update({ where: { id: email.senderId }, data: { autoCategory: null } });
  }

  await recordAuditEvent({
    actionType: "CATEGORIZE",
    entityType: "Email",
    entityId: emailId,
    payloadBefore: before,
    payloadAfter: { category: null, alsoClearSenderRule },
    performedBy: "USER",
  });

  revalidate();
}

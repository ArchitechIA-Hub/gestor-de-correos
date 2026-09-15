"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { computePriorityScore, isUrgentByDeadline } from "@/lib/priority/engine";
import { getNearestOpenCommitment } from "@/lib/priority/nearest-commitment";
import { recordAuditEvent } from "@/lib/audit/record";
import { EMAIL_CATEGORY_FINANZAS } from "@/lib/scan/constants";
import { getBucket, type InboxBucketId } from "@/lib/inbox/buckets";

function revalidate() {
  revalidatePath("/inbox");
  revalidatePath("/digest");
  revalidatePath("/audit");
}

/**
 * Mueve uno o varios correos a un bucket de la bandeja (inbox / finanzas /
 * marketing). Es la acción detrás del menú "Mover a" y de la selección
 * múltiple. Para la regla "…y siempre este remitente" con arrastre, usar
 * `moveToFinanzas(id, true)`.
 */
export async function moveEmailsTo(emailIds: string[], bucketId: InboxBucketId) {
  if (emailIds.length === 0) return;
  const { organizationId } = await requireSession();
  const bucket = getBucket(bucketId);
  const now = new Date();

  // Filtrar por organizationId además de por id: cualquier id de otra
  // organización en la lista se ignora en silencio, igual que si no
  // existiera — nunca se opera sobre él.
  const emails = await prisma.email.findMany({
    where: { id: { in: emailIds }, organizationId },
    include: { sender: true },
  });

  for (const email of emails) {
    const before = {
      status: email.status,
      category: email.category,
      isMarketing: email.isMarketing,
      marketingReason: email.marketingReason,
      priorityScore: email.priorityScore,
      isUrgent: email.isUrgent,
    };

    const due = bucket.isMarketing ? null : (await getNearestOpenCommitment(email.id))?.dueAt ?? null;
    const priorityScore = computePriorityScore(
      { id: email.id, receivedAt: email.receivedAt, isVip: email.sender.isVip, nearestDueAt: due },
      now
    );
    const isUrgent = isUrgentByDeadline(due, now);

    const after = {
      status: bucket.isMarketing ? ("ARCHIVED" as const) : ("CLASSIFIED" as const),
      category: bucket.category,
      isMarketing: bucket.isMarketing,
      marketingReason: bucket.isMarketing ? "Movido manualmente a marketing" : null,
      priorityScore,
      isUrgent,
    };

    await prisma.email.update({ where: { id: email.id }, data: after });

    await recordAuditEvent({
      organizationId,
      actionType: "CATEGORIZE",
      entityType: "Email",
      entityId: email.id,
      payloadBefore: before,
      payloadAfter: { bucket: bucketId, ...after },
      performedBy: "USER",
    });
  }

  revalidate();
}

/**
 * Mueve un correo a la vista "Finanzas". Si `alsoSender`, además fija la regla
 * `Sender.autoCategory` y arrastra los otros correos ya clasificados de ese
 * remitente (para que la bandeja quede limpia de inmediato).
 */
export async function moveToFinanzas(emailId: string, alsoSender = false) {
  const { organizationId } = await requireSession();
  const email = await prisma.email.findFirstOrThrow({
    where: { id: emailId, organizationId },
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

  const due = email.status === "ARCHIVED" ? null : (await getNearestOpenCommitment(emailId))?.dueAt ?? null;
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
    // organizationId explícito aquí, no solo senderId: sin él, este
    // updateMany arrastraría correos de OTRA organización si alguna vez
    // compartieran el mismo senderId (no debería pasar dado que Sender ya es
    // único por (organizationId, email), pero el filtro es la garantía real,
    // no una coincidencia del esquema).
    const res = await prisma.email.updateMany({
      where: { organizationId, senderId: email.senderId, status: "CLASSIFIED", category: null },
      data: { category: EMAIL_CATEGORY_FINANZAS, isMarketing: false, marketingReason: null },
    });
    backfilled = res.count;
  }

  await recordAuditEvent({
    organizationId,
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
  const { organizationId } = await requireSession();
  const email = await prisma.email.findFirstOrThrow({
    where: { id: emailId, organizationId },
    include: { sender: true },
  });

  const now = new Date();
  const before = { category: email.category, priorityScore: email.priorityScore, isUrgent: email.isUrgent };

  const due = (await getNearestOpenCommitment(emailId))?.dueAt ?? null;
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
    organizationId,
    actionType: "CATEGORIZE",
    entityType: "Email",
    entityId: emailId,
    payloadBefore: before,
    payloadAfter: { category: null, alsoClearSenderRule },
    performedBy: "USER",
  });

  revalidate();
}

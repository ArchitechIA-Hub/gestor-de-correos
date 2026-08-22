"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { extractCommitments } from "@/lib/ai/extract-commitments";
import { computePriorityScore, isUrgentByDeadline } from "@/lib/priority/engine";
import { recordAuditEvent } from "@/lib/audit/record";

const SCAN_BATCH_SIZE = 8;

export type ScanResult = {
  scanned: number;
  commitmentsDetected: number;
  urgentDetected: number;
};

/**
 * Ejecuta un ciclo de escaneo sobre el backlog: toma un lote de correos sin
 * clasificar, extrae compromisos con IA sobre el texto libre, recalcula
 * prioridad, aplica el override de urgencia <48h, y audita cada acción.
 */
export async function scan(): Promise<ScanResult> {
  const now = new Date();

  const unclassified = await prisma.email.findMany({
    where: { status: "UNCLASSIFIED" },
    include: { sender: true },
    orderBy: { receivedAt: "asc" },
    take: SCAN_BATCH_SIZE,
  });

  let commitmentsDetected = 0;
  let urgentDetected = 0;

  for (const email of unclassified) {
    const extraction = await extractCommitments({
      subject: email.subject,
      body: email.rawBody,
      receivedAt: email.receivedAt,
    });

    const createdCommitments = [];
    for (const c of extraction.commitments) {
      const created = await prisma.commitment.create({
        data: {
          emailId: email.id,
          description: c.description,
          dueAt: c.dueDateISO ? new Date(c.dueDateISO) : null,
          confidence: c.confidence,
          sourceExcerpt: c.sourceExcerpt,
          detectedByAI: true,
          status: c.dueDateISO && new Date(c.dueDateISO).getTime() < now.getTime() ? "OVERDUE" : "PENDING",
        },
      });
      createdCommitments.push(created);

      await recordAuditEvent({
        actionType: "DETECT_COMMITMENT",
        entityType: "Commitment",
        entityId: created.id,
        payloadAfter: c,
      });
    }
    commitmentsDetected += createdCommitments.length;

    const nearestDueAt =
      createdCommitments
        .map((c) => c.dueAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    const priorityScore = computePriorityScore(
      { id: email.id, receivedAt: email.receivedAt, isVip: email.sender.isVip, nearestDueAt },
      now
    );
    const isUrgent = isUrgentByDeadline(nearestDueAt, now);
    if (isUrgent) urgentDetected++;

    const before = { status: email.status, priorityScore: email.priorityScore, isUrgent: email.isUrgent };

    await prisma.email.update({
      where: { id: email.id },
      data: { status: "CLASSIFIED", priorityScore, isUrgent, classifiedAt: now },
    });

    await recordAuditEvent({
      actionType: "CLASSIFY",
      entityType: "Email",
      entityId: email.id,
      payloadBefore: before,
      payloadAfter: { status: "CLASSIFIED", priorityScore, isUrgent },
    });

    if (isUrgent) {
      await recordAuditEvent({
        actionType: "MARK_URGENT",
        entityType: "Email",
        entityId: email.id,
        payloadBefore: { isUrgent: before.isUrgent },
        payloadAfter: { isUrgent: true, reason: "vencimiento <48h" },
      });
    }
  }

  revalidatePath("/inbox");
  revalidatePath("/digest");
  revalidatePath("/audit");
  revalidatePath("/settings/service-level");

  return { scanned: unclassified.length, commitmentsDetected, urgentDetected };
}

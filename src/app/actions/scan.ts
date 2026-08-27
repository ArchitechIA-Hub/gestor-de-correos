"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { extractCommitments } from "@/lib/ai/extract-commitments";
import { computePriorityScore, isUrgentByDeadline } from "@/lib/priority/engine";
import { recordAuditEvent } from "@/lib/audit/record";
import { createUrgentAlert } from "@/lib/alerts";
import { createCalendarEvent } from "@/lib/calendar";
import { sendWhatsAppNotification } from "@/lib/whatsapp";
import { getExtraConfig } from "@/lib/extras";

const SCAN_BATCH_SIZE = 8;

export type ScanResult = {
  scanned: number;
  commitmentsDetected: number;
  urgentDetected: number;
  marketingDetected: number;
};

/**
 * Ejecuta un ciclo de escaneo sobre el backlog: toma un lote de correos sin
 * clasificar, extrae compromisos con IA sobre el texto libre, recalcula
 * prioridad, aplica el override de urgencia <48h, y audita cada acción.
 */
export async function scan(): Promise<ScanResult> {
  const now = new Date();
  const extraConfig = await getExtraConfig();

  const unclassified = await prisma.email.findMany({
    where: { status: "UNCLASSIFIED" },
    include: { sender: true },
    orderBy: { receivedAt: "asc" },
    take: SCAN_BATCH_SIZE,
  });

  let commitmentsDetected = 0;
  let urgentDetected = 0;
  let marketingDetected = 0;

  for (const email of unclassified) {
    const extraction = await extractCommitments({
      subject: email.subject,
      body: email.rawBody,
      receivedAt: email.receivedAt,
    });

    if (extraction.isMarketing) {
      marketingDetected++;

      const before = { status: email.status, priorityScore: email.priorityScore, isUrgent: email.isUrgent, isMarketing: email.isMarketing };
      const after = { status: "ARCHIVED" as const, isMarketing: true, marketingReason: extraction.marketingReason };

      await prisma.email.update({
        where: { id: email.id },
        data: { ...after, classifiedAt: now },
      });

      await recordAuditEvent({
        actionType: "CLASSIFY",
        entityType: "Email",
        entityId: email.id,
        payloadBefore: before,
        payloadAfter: after,
      });

      await recordAuditEvent({
        actionType: "MARK_MARKETING",
        entityType: "Email",
        entityId: email.id,
        payloadBefore: before,
        payloadAfter: after,
      });

      continue;
    }

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

      if (extraConfig.calendarEnabled && created.dueAt) {
        await createCalendarEvent({ commitmentId: created.id, title: created.description, start: created.dueAt });
      }
    }
    commitmentsDetected += createdCommitments.length;

    const nearestCommitment =
      createdCommitments
        .filter((c) => c.dueAt !== null)
        .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0] ?? null;
    const nearestDueAt = nearestCommitment?.dueAt ?? null;

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

      await createUrgentAlert({
        emailId: email.id,
        subject: email.subject,
        senderName: email.sender.name,
        commitmentId: nearestCommitment?.id,
        dueAt: nearestDueAt,
      });

      if (extraConfig.whatsappEnabled && nearestCommitment) {
        await sendWhatsAppNotification({
          commitmentId: nearestCommitment.id,
          message: `${email.sender.name}: "${email.subject}" vence en menos de 48h`,
        });
      }
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/inbox");
  revalidatePath("/digest");
  revalidatePath("/audit");
  revalidatePath("/settings/service-level");

  return { scanned: unclassified.length, commitmentsDetected, urgentDetected, marketingDetected };
}

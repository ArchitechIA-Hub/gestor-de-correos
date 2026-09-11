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
import { getUserTimeZone } from "@/lib/settings";
import { parseDueDate } from "@/lib/ai/parse-due-date";
import { SCAN_BATCH_SIZE, MIN_SCAN_BATCH_SIZE, EMAIL_CATEGORY_FINANZAS } from "@/lib/scan/constants";

export type ScanResult = {
  scanned: number;
  commitmentsDetected: number;
  urgentDetected: number;
  marketingDetected: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ScanOptions = {
  /**
   * Si se pasa, limita el lote a los correos sin clasificar de esa cuenta —
   * útil para clasificar de inmediato una cuenta recién conectada (p. ej.
   * Gmail) sin esperar a vaciar el backlog global por antigüedad. Sin este
   * filtro, el comportamiento es el de siempre: lote global por antigüedad.
   */
  mailAccountId?: string;
  /**
   * Cuántos correos procesar en esta pasada. Se recorta a
   * [MIN_SCAN_BATCH_SIZE, SCAN_BATCH_SIZE]; por defecto SCAN_BATCH_SIZE.
   */
  limit?: number;
};

/**
 * Ejecuta un ciclo de escaneo sobre el backlog: toma un lote de correos sin
 * clasificar, extrae compromisos con IA sobre el texto libre, recalcula
 * prioridad, aplica el override de urgencia <48h, y audita cada acción.
 */
export async function scan(options: ScanOptions = {}): Promise<ScanResult> {
  const now = new Date();
  const extraConfig = await getExtraConfig();
  const timeZone = await getUserTimeZone();

  const requestedLimit = Number.isFinite(options.limit) ? Math.floor(options.limit!) : SCAN_BATCH_SIZE;
  const batchSize = Math.min(SCAN_BATCH_SIZE, Math.max(MIN_SCAN_BATCH_SIZE, requestedLimit));

  const unclassified = await prisma.email.findMany({
    where: {
      status: "UNCLASSIFIED",
      ...(options.mailAccountId ? { mailAccountId: options.mailAccountId } : {}),
    },
    include: { sender: true },
    orderBy: { receivedAt: "asc" },
    take: batchSize,
  });

  let commitmentsDetected = 0;
  let urgentDetected = 0;
  let marketingDetected = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const email of unclassified) {
    const { extraction, usage } = await extractCommitments({
      subject: email.subject,
      body: email.rawBody,
      receivedAt: email.receivedAt,
      timeZone,
    });
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    totalTokens += usage.totalTokens;

    // Regla fija del remitente > detección de la IA. Un remitente enrutado a
    // FINANZAS por regla no se archiva como marketing aunque la IA lo diga.
    const forcedCategory = email.sender.autoCategory ?? null;
    const category = forcedCategory ?? extraction.category ?? null;
    const treatAsMarketing = extraction.isMarketing && forcedCategory !== EMAIL_CATEGORY_FINANZAS;

    if (treatAsMarketing) {
      marketingDetected++;

      const before = { status: email.status, priorityScore: email.priorityScore, isUrgent: email.isUrgent, isMarketing: email.isMarketing };
      const after = {
        status: "ARCHIVED" as const,
        isMarketing: true,
        marketingReason: extraction.marketingReason,
        category,
        summary: extraction.summary,
      };

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
      const dueAt = parseDueDate(c.dueDateISO, timeZone);
      const created = await prisma.commitment.create({
        data: {
          emailId: email.id,
          description: c.description,
          dueAt,
          confidence: c.confidence,
          sourceExcerpt: c.sourceExcerpt,
          detectedByAI: true,
          status: dueAt && dueAt.getTime() < now.getTime() ? "OVERDUE" : "PENDING",
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
      data: { status: "CLASSIFIED", priorityScore, isUrgent, category, classifiedAt: now, summary: extraction.summary },
    });

    await recordAuditEvent({
      actionType: "CLASSIFY",
      entityType: "Email",
      entityId: email.id,
      payloadBefore: before,
      payloadAfter: { status: "CLASSIFIED", priorityScore, isUrgent, category },
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

  return {
    scanned: unclassified.length,
    commitmentsDetected,
    urgentDetected,
    marketingDetected,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";

/**
 * Aprobación humana explícita de un borrador. Este es el único cambio de
 * estado posible hacia "enviable" — el prototipo no implementa ninguna
 * acción de envío real, por lo que "nunca se envía sin aprobación humana"
 * se cumple por construcción.
 */
export async function approveDraft(draftId: string) {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  const respondedAt = new Date();

  const [updated] = await prisma.$transaction([
    prisma.draft.update({
      where: { id: draftId },
      data: { status: "APPROVED", approvedAt: respondedAt },
    }),
    // Aprobar un borrador es la única acción del prototipo que representa
    // "ya se le respondió a este correo" — sin esto, el correo se quedaba
    // viéndose como pendiente para siempre aunque ya tuviera una respuesta
    // aprobada (afectaba /inbox, el digest y el SLA de VIP).
    prisma.email.update({
      where: { id: draft.emailId },
      data: { respondedAt },
    }),
  ]);

  await recordAuditEvent({
    actionType: "APPROVE_DRAFT",
    entityType: "Draft",
    entityId: draftId,
    payloadBefore: { status: draft.status },
    payloadAfter: { status: "APPROVED" },
    performedBy: "USER",
    reversible: false,
  });

  revalidatePath(`/inbox/${updated.emailId}`);
  revalidatePath("/inbox");
  revalidatePath("/audit");

  return updated;
}

export async function discardDraft(draftId: string) {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });

  const updated = await prisma.draft.update({
    where: { id: draftId },
    data: { status: "DISCARDED" },
  });

  await recordAuditEvent({
    actionType: "APPROVE_DRAFT",
    entityType: "Draft",
    entityId: draftId,
    payloadBefore: { status: draft.status },
    payloadAfter: { status: "DISCARDED" },
    performedBy: "USER",
    reversible: false,
  });

  revalidatePath(`/inbox/${updated.emailId}`);
  revalidatePath("/audit");

  return updated;
}

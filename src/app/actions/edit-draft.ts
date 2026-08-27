"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";

/**
 * Edición manual del contenido de un borrador antes de aprobarlo. Solo se
 * permite mientras está pendiente de revisión — un borrador ya aprobado o
 * descartado no se edita, se genera uno nuevo.
 */
export async function editDraft(draftId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("El contenido del borrador no puede quedar vacío.");

  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  if (draft.status !== "PENDING_REVIEW") {
    throw new Error("Solo se puede editar un borrador pendiente de revisión.");
  }

  const updated = await prisma.draft.update({
    where: { id: draftId },
    data: { content: trimmed },
  });

  await recordAuditEvent({
    actionType: "EDIT_DRAFT",
    entityType: "Draft",
    entityId: draftId,
    payloadBefore: { content: draft.content },
    payloadAfter: { content: trimmed },
    performedBy: "USER",
    reversible: false,
  });

  revalidatePath(`/inbox/${updated.emailId}`);
  revalidatePath("/audit");

  return updated;
}

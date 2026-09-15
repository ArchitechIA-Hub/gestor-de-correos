"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/record";

/**
 * Edición manual del contenido de un borrador antes de aprobarlo. Solo se
 * permite mientras está pendiente de revisión — un borrador ya aprobado o
 * descartado no se edita, se genera uno nuevo.
 */
export async function editDraft(draftId: string, content: string) {
  const { organizationId } = await requireSession();
  const trimmed = content.trim();
  if (!trimmed) throw new Error("El contenido del borrador no puede quedar vacío.");

  // Draft no lleva organizationId directo — ownership vía el email al que
  // pertenece.
  const draft = await prisma.draft.findFirstOrThrow({ where: { id: draftId, email: { organizationId } } });
  if (draft.status !== "PENDING_REVIEW") {
    throw new Error("Solo se puede editar un borrador pendiente de revisión.");
  }

  const updated = await prisma.draft.update({
    where: { id: draftId },
    data: { content: trimmed },
  });

  await recordAuditEvent({
    organizationId,
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

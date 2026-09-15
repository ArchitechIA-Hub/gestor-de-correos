"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/record";
import { sendGmailReply, type OutgoingAttachment } from "@/lib/gmail/send";
import { getNearestOpenCommitment } from "@/lib/priority/nearest-commitment";
import { recomputeEmailPriority } from "@/lib/priority/recompute-email";

/**
 * Aprobación humana explícita de un borrador. Para cuentas conectadas por
 * Gmail real (provider "gmail"), esto envía la respuesta de verdad vía la
 * API de Gmail (scope gmail.send) antes de marcar el borrador como
 * aprobado — si el envío falla, no se aprueba nada. Para cuentas mock, el
 * comportamiento es el de siempre: solo cambia estado interno, nunca envía
 * nada real. En ambos casos "nunca se envía sin aprobación humana" se
 * cumple porque este server action solo se dispara con el clic explícito
 * del usuario (con confirmación adicional en la UI cuando sí va a enviar).
 *
 * `attachments` solo aplica a cuentas Gmail reales: son los archivos que el
 * usuario adjuntó en el diálogo de confirmación antes de enviar.
 */
export async function approveDraft(draftId: string, attachments: OutgoingAttachment[] = []) {
  const { organizationId } = await requireSession();
  // Draft no lleva organizationId directo — el ownership se valida vía el
  // email al que pertenece, que sí lo lleva. Un draftId de otra organización
  // se trata igual que uno inexistente (findFirstOrThrow lanza igual que
  // findUniqueOrThrow, pero permite combinar el id con este filtro).
  const draft = await prisma.draft.findFirstOrThrow({
    where: { id: draftId, email: { organizationId } },
    include: { email: { include: { mailAccount: true, sender: true } } },
  });
  const respondedAt = new Date();

  let sentMessageId: string | null = null;
  if (draft.email.mailAccount.provider === "gmail") {
    sentMessageId = await sendGmailReply({
      mailAccount: draft.email.mailAccount,
      to: draft.email.sender.email,
      subject: draft.email.subject,
      body: draft.content,
      threadId: draft.email.threadId,
      inReplyTo: draft.email.rfcMessageId,
      ...(attachments.length > 0 ? { attachments } : {}),
    });
  }
  const attachmentNames = attachments.map((a) => a.filename);

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
    organizationId,
    actionType: sentMessageId ? "SEND_DRAFT" : "APPROVE_DRAFT",
    entityType: "Draft",
    entityId: draftId,
    payloadBefore: { status: draft.status },
    payloadAfter: sentMessageId
      ? {
          status: "APPROVED",
          to: draft.email.sender.email,
          subject: draft.email.subject,
          sentMessageId,
          ...(attachmentNames.length > 0 ? { attachments: attachmentNames } : {}),
        }
      : { status: "APPROVED" },
    performedBy: "USER",
    reversible: false,
  });

  // Responder a un correo es la señal más directa de que su compromiso ya se
  // atendió: se auto-completa el más próximo abierto, sin que el usuario
  // tenga que acordarse de marcarlo aparte. Queda auditado como acción del
  // sistema y es reversible, igual que si lo marcara a mano.
  const nearest = await getNearestOpenCommitment(draft.emailId);
  if (nearest) {
    await prisma.commitment.update({ where: { id: nearest.id }, data: { status: "COMPLETED" } });
    await recomputeEmailPriority(draft.emailId, respondedAt);
    await recordAuditEvent({
      organizationId,
      actionType: "UPDATE_COMMITMENT_STATUS",
      entityType: "Commitment",
      entityId: nearest.id,
      payloadBefore: { status: nearest.status },
      payloadAfter: { status: "COMPLETED", reason: "respuesta enviada" },
      performedBy: "SYSTEM",
    });
  }

  revalidatePath(`/inbox/${updated.emailId}`);
  revalidatePath("/inbox");
  revalidatePath("/audit");

  return updated;
}

export async function discardDraft(draftId: string) {
  const { organizationId } = await requireSession();
  const draft = await prisma.draft.findFirstOrThrow({ where: { id: draftId, email: { organizationId } } });

  const updated = await prisma.draft.update({
    where: { id: draftId },
    data: { status: "DISCARDED" },
  });

  await recordAuditEvent({
    organizationId,
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

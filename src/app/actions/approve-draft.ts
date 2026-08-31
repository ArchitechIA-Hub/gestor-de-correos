"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";
import { sendGmailReply, type OutgoingAttachment } from "@/lib/gmail/send";

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
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: draftId },
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

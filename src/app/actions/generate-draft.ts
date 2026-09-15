"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { generateDraft as generateDraftText } from "@/lib/ai/generate-draft";
import { recordAuditEvent } from "@/lib/audit/record";
import { OPENAI_MODEL } from "@/lib/ai/client";
import type { DraftResponseType } from "@/generated/prisma/enums";

export async function generateDraftForEmail(emailId: string, responseType: DraftResponseType) {
  const { organizationId } = await requireSession();

  // findFirstOrThrow (no findUniqueOrThrow) para poder combinar el id con el
  // filtro de organización — un emailId de otra organización se trata igual
  // que uno inexistente.
  const [email, config, organization] = await Promise.all([
    prisma.email.findFirstOrThrow({
      where: { id: emailId, organizationId },
      include: { sender: true, commitments: true },
    }),
    prisma.extraConfig.findFirst({ where: { organizationId } }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
  ]);

  const content = await generateDraftText({
    senderName: email.sender.name,
    subject: email.subject,
    body: email.rawBody,
    commitmentDescriptions: email.commitments.map((c) => c.description),
    tone: config?.autoDraftToneEnabled ? "cordial, ejecutivo, directo, sin rodeos" : undefined,
    responseType,
    signerName: organization.name,
  });

  const draft = await prisma.draft.create({
    data: {
      emailId: email.id,
      content,
      responseType,
      status: "PENDING_REVIEW",
      modelUsed: OPENAI_MODEL,
    },
  });

  await recordAuditEvent({
    organizationId,
    actionType: "GENERATE_DRAFT",
    entityType: "Draft",
    entityId: draft.id,
    payloadAfter: { emailId: email.id, status: "PENDING_REVIEW", responseType },
  });

  revalidatePath(`/inbox/${emailId}`);
  revalidatePath("/audit");

  return draft;
}

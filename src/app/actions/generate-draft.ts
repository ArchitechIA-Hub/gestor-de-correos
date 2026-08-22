"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { generateDraft as generateDraftText } from "@/lib/ai/generate-draft";
import { recordAuditEvent } from "@/lib/audit/record";
import { CLAUDE_MODEL } from "@/lib/ai/client";

export async function generateDraftForEmail(emailId: string) {
  const email = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    include: { sender: true, commitments: true },
  });

  const config = await prisma.extraConfig.findFirst();

  const content = await generateDraftText({
    senderName: email.sender.name,
    subject: email.subject,
    body: email.rawBody,
    commitmentDescriptions: email.commitments.map((c) => c.description),
    tone: config?.autoDraftToneEnabled ? "cordial, ejecutivo, directo, sin rodeos" : undefined,
  });

  const draft = await prisma.draft.create({
    data: {
      emailId: email.id,
      content,
      status: "PENDING_REVIEW",
      modelUsed: CLAUDE_MODEL,
    },
  });

  await recordAuditEvent({
    actionType: "GENERATE_DRAFT",
    entityType: "Draft",
    entityId: draft.id,
    payloadAfter: { emailId: email.id, status: "PENDING_REVIEW" },
  });

  revalidatePath(`/inbox/${emailId}`);
  revalidatePath("/audit");

  return draft;
}

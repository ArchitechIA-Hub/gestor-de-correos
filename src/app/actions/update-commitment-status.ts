"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";

/**
 * Cierre manual de un compromiso desde el modo rescate (o cualquier otra
 * vista): el usuario lo marca como cumplido o lo cancela. Queda auditado y
 * es reversible (ver src/lib/audit/revert.ts).
 */
export async function updateCommitmentStatus(commitmentId: string, status: "COMPLETED" | "CANCELLED") {
  const commitment = await prisma.commitment.findUniqueOrThrow({ where: { id: commitmentId } });

  const before = { status: commitment.status };
  const after = { status };

  await prisma.commitment.update({ where: { id: commitmentId }, data: after });

  await recordAuditEvent({
    actionType: "UPDATE_COMMITMENT_STATUS",
    entityType: "Commitment",
    entityId: commitmentId,
    payloadBefore: before,
    payloadAfter: after,
    performedBy: "USER",
  });

  revalidatePath("/rescue");
  revalidatePath("/inbox");
  revalidatePath("/audit");
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";
import { recomputeEmailPriority } from "@/lib/priority/recompute-email";

/**
 * Cierre manual de un compromiso desde el detalle del correo o desde el modo
 * rescate: el usuario lo marca como cumplido o lo cancela. Queda auditado y
 * es reversible (ver src/lib/audit/revert.ts). Recalcula de inmediato la
 * prioridad/urgencia del correo asociado — sin esto, "marcar cumplido" no
 * quitaba la urgencia hasta el próximo movimiento de bandeja.
 */
export async function updateCommitmentStatus(commitmentId: string, status: "COMPLETED" | "CANCELLED") {
  const commitment = await prisma.commitment.findUniqueOrThrow({ where: { id: commitmentId } });

  const before = { status: commitment.status };
  const after = { status };

  await prisma.commitment.update({ where: { id: commitmentId }, data: after });
  await recomputeEmailPriority(commitment.emailId);

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
  revalidatePath(`/inbox/${commitment.emailId}`);
  revalidatePath("/audit");
}

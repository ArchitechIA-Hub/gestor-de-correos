import { prisma } from "@/lib/db/prisma";

/**
 * El compromiso abierto (PENDING u OVERDUE — excluye COMPLETED/CANCELLED) más
 * próximo a vencer de un correo. Fuente única para recomputar `priorityScore`/
 * `isUrgent` (ver src/lib/priority/engine.ts) cada vez que cambia el estado de
 * un compromiso o de la categoría/bucket del correo.
 */
export async function getNearestOpenCommitment(
  emailId: string
): Promise<{ id: string; dueAt: Date | null; status: "PENDING" | "OVERDUE" } | null> {
  const commitment = await prisma.commitment.findFirst({
    where: { emailId, status: { in: ["PENDING", "OVERDUE"] } },
    // Los que tienen fecha van primero (más próximo primero); sin fecha quedan
    // al final — así una fecha real siempre gana para efectos de score, pero
    // igual hay un compromiso "más próximo" que ofrecer para marcar
    // cumplido/cancelar aunque ninguno tenga fecha.
    orderBy: { dueAt: { sort: "asc", nulls: "last" } },
    select: { id: true, dueAt: true, status: true },
  });
  return (commitment as { id: string; dueAt: Date | null; status: "PENDING" | "OVERDUE" }) ?? null;
}

import { prisma } from "@/lib/db/prisma";
import { RESCUE_MODE_COMMITMENT_COUNT } from "./constants";

/**
 * Los N compromisos más urgentes ahora mismo (plan de choque de Modo rescate).
 * Ordena por el mismo priorityScore que ya combina urgencia + VIP en el motor
 * de priorización (src/lib/priority/engine.ts) — no reimplementa ese cálculo.
 */
export async function getRescuePlan(organizationId: string) {
  return prisma.commitment.findMany({
    where: { status: { in: ["PENDING", "OVERDUE"] }, email: { organizationId } },
    include: { email: { include: { sender: true, mailAccount: true } } },
    orderBy: [{ email: { priorityScore: "desc" } }, { dueAt: "asc" }],
    take: RESCUE_MODE_COMMITMENT_COUNT,
  });
}

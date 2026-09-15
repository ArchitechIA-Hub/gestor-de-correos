import { prisma } from "@/lib/db/prisma";
import { getServiceLevel } from "./service-level";

/**
 * Único punto de consulta del backlog real + nivel de servicio actual.
 * Cualquier página o acción que necesite "en qué nivel estamos" pasa por aquí,
 * para no duplicar la query de backlog en varios lugares.
 */
export async function getCurrentServiceLevel(organizationId: string) {
  const backlogCount = await prisma.email.count({ where: { organizationId, status: "UNCLASSIFIED" } });
  return { backlogCount, ...getServiceLevel(backlogCount) };
}

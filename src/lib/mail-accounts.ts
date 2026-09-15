import { prisma } from "@/lib/db/prisma";

/**
 * Único punto de consulta de cuentas de correo activas. Usado por la
 * subdivisión de bandeja en /inbox y por la gestión en /settings/accounts.
 */
export async function getActiveMailAccounts(organizationId: string) {
  return prisma.mailAccount.findMany({
    where: { organizationId, isActive: true },
    orderBy: { label: "asc" },
  });
}

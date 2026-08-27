import { prisma } from "@/lib/db/prisma";

/**
 * Único punto de consulta de cuentas de correo activas. Usado por la
 * subdivisión de bandeja en /inbox y por la gestión en /settings/accounts.
 */
export async function getActiveMailAccounts() {
  return prisma.mailAccount.findMany({
    where: { isActive: true },
    orderBy: { label: "asc" },
  });
}

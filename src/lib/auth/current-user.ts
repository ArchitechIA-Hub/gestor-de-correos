import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";

/**
 * Usuario real de la sesión actual (reemplaza la constante fija
 * `CURRENT_USER_NAME` del prototipo de un solo usuario). `cache()` de React
 * evita repetir la consulta si varias partes del árbol de un mismo render
 * RSC la piden — no hace falta parametrizar por organizationId como en
 * `getUserTimeZone`/`getExtraConfig` porque aquí no hay ningún argumento de
 * entrada que varíe entre llamadas dentro del mismo request.
 */
export const getCurrentUser = cache(async () => {
  const session = await requireSession();
  return prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
});

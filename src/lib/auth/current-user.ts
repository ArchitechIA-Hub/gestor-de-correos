import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireSession, clearSessionCookie, type SessionPayload } from "@/lib/auth/session";

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

/**
 * Igual que `requireSession()`, pero además verifica contra la BD que el
 * usuario y su organización sigan activos — `requireSession()` por sí solo
 * (Edge-safe, ver src/lib/auth/session.ts) solo valida la firma/expiración
 * del JWT, así que desactivar a alguien no le revocaba el acceso hasta que
 * su cookie expirara sola (hasta 7 días). Deliberadamente NO se metió esta
 * consulta dentro de `requireSession()`/`src/proxy.ts`: ese archivo también
 * lo usa el middleware en runtime Edge, que no puede traer el cliente de
 * Prisma (bindings nativos). Se llama una sola vez desde el layout del
 * dashboard (src/app/(dashboard)/layout.tsx), que ya envuelve TODA la UI
 * autenticada — así una desactivación se refleja en la siguiente navegación,
 * sin tener que tocar cada Server Action/Route Handler uno por uno.
 */
export async function requireActiveSession(): Promise<SessionPayload> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isActive: true, organization: { select: { isActive: true } } },
  });

  if (!user?.isActive || !user.organization.isActive) {
    await clearSessionCookie();
    redirect("/login");
  }

  return session;
}

"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session";
import { checkLoginRateLimit, recordLoginFailure, recordLoginSuccess } from "@/lib/auth/login-rate-limit";

/**
 * Mejor esfuerzo para identificar al cliente detrás de un reverse proxy
 * (Caddy en la demo de Hostinger, ver comentario equivalente en
 * src/app/api/auth/google/callback/route.ts) — `x-forwarded-for` puede traer
 * varias IPs separadas por coma (cada proxy intermedio antepone la suya); la
 * primera es la del cliente original. Si no hay proxy delante (dev local) no
 * hay cabecera y el rate limit sigue funcionando solo por email.
 */
async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return h.get("x-real-ip");
}

/**
 * Login real (email + password) — reemplaza la contraseña única compartida
 * del prototipo. Mensaje de error siempre genérico, tanto si el email no
 * existe como si la contraseña es incorrecta o el usuario está inactivo:
 * nunca reveles cuál de los tres casos ocurrió (evita darle a un atacante
 * una señal de qué emails están registrados).
 *
 * Rate limit de fuerza bruta (por email y por IP, backoff exponencial — ver
 * src/lib/auth/login-rate-limit.ts): antes de esto no había ningún límite de
 * intentos. El bloqueo se anuncia con un error propio (`error=2`) en vez del
 * genérico porque no filtra nada sobre qué cuentas existen — solo dice
 * "vas muy rápido", igual que cualquier rate limit público.
 */
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/inbox");

  const genericError = () => redirect(`/login?from=${encodeURIComponent(from)}&error=1`);
  const rateLimitedError = () => redirect(`/login?from=${encodeURIComponent(from)}&error=2`);

  if (!email || !password) genericError();

  const ip = await getClientIp();
  const rateLimitKeys = { email, ip };

  const rateLimit = checkLoginRateLimit(rateLimitKeys);
  if (rateLimit.limited) rateLimitedError();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    recordLoginFailure(rateLimitKeys);
    genericError();
  }

  const passwordMatches = await bcrypt.compare(password, user!.passwordHash);
  if (!passwordMatches) {
    recordLoginFailure(rateLimitKeys);
    genericError();
  }

  recordLoginSuccess(rateLimitKeys);
  await setSessionCookie({ userId: user!.id, organizationId: user!.organizationId });

  redirect(from || "/inbox");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

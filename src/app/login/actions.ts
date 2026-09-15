"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session";

/**
 * Login real (email + password) — reemplaza la contraseña única compartida
 * del prototipo. Mensaje de error siempre genérico, tanto si el email no
 * existe como si la contraseña es incorrecta o el usuario está inactivo:
 * nunca reveles cuál de los tres casos ocurrió (evita darle a un atacante
 * una señal de qué emails están registrados).
 */
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/inbox");

  const genericError = () => redirect(`/login?from=${encodeURIComponent(from)}&error=1`);

  if (!email || !password) genericError();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) genericError();

  const passwordMatches = await bcrypt.compare(password, user!.passwordHash);
  if (!passwordMatches) genericError();

  await setSessionCookie({ userId: user!.id, organizationId: user!.organizationId });

  redirect(from || "/inbox");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

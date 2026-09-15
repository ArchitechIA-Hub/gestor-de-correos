"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";

const BCRYPT_COST = 12; // mismo costo que el resto de altas de usuario (ver decision_agentes_confiabilidad_seguridad en memoria)
const MIN_PASSWORD_LENGTH = 8;

export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  const { userId } = await requireSession();

  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const currentMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!currentMatches) {
    throw new Error("La contraseña actual no es correcta.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

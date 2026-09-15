"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";

export async function updateProfile(input: { userName: string; organizationName: string }) {
  const { userId, organizationId } = await requireSession();

  const userName = input.userName.trim();
  const organizationName = input.organizationName.trim();
  if (!userName) throw new Error("El nombre no puede estar vacío.");
  if (!organizationName) throw new Error("El nombre de la organización no puede estar vacío.");

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { name: userName } }),
    prisma.organization.update({ where: { id: organizationId }, data: { name: organizationName } }),
  ]);

  // El nombre de la organización aparece en el Informe, en la firma de los
  // borradores y en el header — revalidar todo el layout.
  revalidatePath("/", "layout");
}

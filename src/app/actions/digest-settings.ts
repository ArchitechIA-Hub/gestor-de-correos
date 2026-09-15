"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/settings";
import { isValidEmail } from "@/lib/utils";

export async function setDigestRecipient(email: string) {
  const { organizationId } = await requireSession();
  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) {
    throw new Error("Correo inválido.");
  }

  const settings = await getAppSettings(organizationId);
  const updated = await prisma.appSettings.update({
    where: { id: settings.id },
    data: { digestRecipientEmail: trimmed },
  });

  revalidatePath("/digest");
  return updated;
}

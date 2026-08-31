"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getAppSettings } from "@/lib/settings";
import { isValidTimeZone } from "@/lib/format/timezone";

export async function setUserTimeZone(timeZone: string) {
  if (!isValidTimeZone(timeZone)) {
    throw new Error("Zona horaria inválida.");
  }

  const settings = await getAppSettings();
  const updated = await prisma.appSettings.update({
    where: { id: settings.id },
    data: { timeZone },
  });

  // Las fechas se formatean en /inbox, /digest, /rescue, /panel, /audit,
  // /sent y en el header — revalidar todo el layout.
  revalidatePath("/", "layout");
  return updated;
}

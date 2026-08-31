import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_TIME_ZONE } from "@/lib/format/timezone";

export async function getAppSettings() {
  const settings = await prisma.appSettings.findFirst();
  if (settings) return settings;
  return prisma.appSettings.create({ data: {} });
}

/**
 * Zona horaria configurada por el usuario, para formatear fechas en servidor.
 * `cache()` deduplica la lectura de BD entre layout y página en un mismo
 * render RSC.
 */
export const getUserTimeZone = cache(async (): Promise<string> => {
  const settings = await getAppSettings();
  return settings.timeZone || DEFAULT_TIME_ZONE;
});

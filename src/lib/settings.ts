import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_TIME_ZONE } from "@/lib/format/timezone";

/**
 * Antes era una fila única global (`findFirst()` sin filtro). Ahora una fila
 * por organización — `organizationId` viene siempre de la sesión
 * (`requireSession()`), nunca opcional, para no repetir el patrón de
 * "olvidé filtrar" en ningún call site nuevo.
 */
export async function getAppSettings(organizationId: string) {
  const settings = await prisma.appSettings.findFirst({ where: { organizationId } });
  if (settings) return settings;
  return prisma.appSettings.create({ data: { organizationId } });
}

/**
 * Zona horaria configurada por la organización, para formatear fechas en
 * servidor. `cache()` deduplica la lectura de BD entre layout y página en un
 * mismo render RSC — la key de cache incluye `organizationId` para no
 * filtrar el resultado de una organización hacia otra dentro del mismo
 * proceso.
 */
export const getUserTimeZone = cache(async (organizationId: string): Promise<string> => {
  const settings = await getAppSettings(organizationId);
  return settings.timeZone || DEFAULT_TIME_ZONE;
});

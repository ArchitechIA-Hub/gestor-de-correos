import { prisma } from "@/lib/db/prisma";
import { EXTRAS_CONSOLIDATION_THRESHOLD } from "@/lib/priority/constants";
import type { ExtraConfigModel } from "@/generated/prisma/models";

const EXTRA_FLAG_KEYS = [
  "calendarEnabled",
  "whatsappEnabled",
  "autoDraftToneEnabled",
  "vipSlaEnabled",
  "analyticsEnabled",
] as const;

export type ExtraFlagKey = (typeof EXTRA_FLAG_KEYS)[number];

/**
 * Antes era una fila única global. Ahora una fila por organización —
 * `organizationId` viene siempre de la sesión, nunca opcional.
 */
export async function getExtraConfig(organizationId: string) {
  const config = await prisma.extraConfig.findFirst({ where: { organizationId } });
  if (config) return config;
  return prisma.extraConfig.create({ data: { organizationId } });
}

export function countActiveExtras(config: ExtraConfigModel): number {
  return EXTRA_FLAG_KEYS.filter((key) => config[key]).length;
}

/**
 * Regla de negocio: con 3 o más extras activados, la UI debe unificar todo
 * en un panel único en vez de notificaciones separadas por canal.
 */
export function shouldConsolidatePanel(config: ExtraConfigModel): boolean {
  return countActiveExtras(config) >= EXTRAS_CONSOLIDATION_THRESHOLD;
}

export { EXTRA_FLAG_KEYS };

import { prisma } from "@/lib/db/prisma";

export async function getAppSettings() {
  const settings = await prisma.appSettings.findFirst();
  if (settings) return settings;
  return prisma.appSettings.create({ data: {} });
}

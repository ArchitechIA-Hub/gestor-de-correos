"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";

/**
 * Marcar una alerta como leída es una interacción de lectura del usuario, no
 * una acción automática del sistema — no pasa por el log de auditoría (igual
 * que abrir un correo no se audita).
 */
export async function markAlertRead(alertId: string) {
  await prisma.urgentAlert.update({
    where: { id: alertId },
    data: { readAt: new Date() },
  });

  revalidatePath("/", "layout");
}

export async function markAllAlertsRead() {
  await prisma.urgentAlert.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/", "layout");
}

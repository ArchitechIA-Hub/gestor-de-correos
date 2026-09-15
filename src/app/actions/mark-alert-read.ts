"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";

/**
 * Marcar una alerta como leída es una interacción de lectura del usuario, no
 * una acción automática del sistema — no pasa por el log de auditoría (igual
 * que abrir un correo no se audita).
 */
export async function markAlertRead(alertId: string) {
  const { organizationId } = await requireSession();
  // updateMany (no update) para poder combinar el id con el filtro de
  // organización sin lanzar si no hay match — un alertId de otra
  // organización simplemente no actualiza nada.
  await prisma.urgentAlert.updateMany({
    where: { id: alertId, organizationId },
    data: { readAt: new Date() },
  });

  revalidatePath("/", "layout");
}

export async function markAllAlertsRead() {
  const { organizationId } = await requireSession();
  await prisma.urgentAlert.updateMany({
    where: { organizationId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/", "layout");
}

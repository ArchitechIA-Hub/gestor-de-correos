"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";

/**
 * Estado de lectura del correo. Es una interacción de lectura del usuario,
 * independiente de las alertas push urgentes (esas se marcan leídas por
 * separado desde la campanita) — no pasa por el log de auditoría.
 */
export async function setEmailReadState(emailId: string, read: boolean) {
  const { organizationId } = await requireSession();
  // updateMany (no update) para combinar el id con el filtro de organización
  // sin lanzar — un emailId de otra organización no actualiza nada.
  await prisma.email.updateMany({
    where: { id: emailId, organizationId },
    data: { readAt: read ? new Date() : null },
  });

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${emailId}`);
}

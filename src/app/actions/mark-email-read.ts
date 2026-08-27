"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";

/**
 * Estado de lectura del correo. Es una interacción de lectura del usuario,
 * independiente de las alertas push urgentes (esas se marcan leídas por
 * separado desde la campanita) — no pasa por el log de auditoría.
 */
export async function setEmailReadState(emailId: string, read: boolean) {
  await prisma.email.update({
    where: { id: emailId },
    data: { readAt: read ? new Date() : null },
  });

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${emailId}`);
}

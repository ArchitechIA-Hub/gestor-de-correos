"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { generateMockEmails } from "@/lib/mock/generate-emails";

/**
 * Herramienta SOLO de desarrollo: agrega correos sintéticos sin clasificar
 * para cruzar los umbrales de backlog (200/800/2500) durante una demo. El
 * nivel de servicio sigue siendo 100% auto-calculado a partir de este
 * backlog — esta acción nunca fija el nivel directamente.
 */
export async function devSeedBacklog(count: number) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("dev-seed-backlog no está disponible en producción.");
  }

  const now = new Date();
  const generated = generateMockEmails(count, now);
  const uniquePrefix = `dev-${Date.now()}`;

  const senderCache = new Map<string, string>();

  for (const item of generated) {
    let senderId = senderCache.get(item.sender.email);
    if (!senderId) {
      const sender = await prisma.sender.upsert({
        where: { email: item.sender.email },
        update: {},
        create: {
          email: item.sender.email,
          name: item.sender.name,
          isVip: item.sender.isVip,
          vipReason: item.sender.vipReason,
          organization: item.sender.organization,
        },
      });
      senderId = sender.id;
      senderCache.set(item.sender.email, senderId);
    }

    await prisma.email.create({
      data: {
        senderId,
        threadId: `${uniquePrefix}-${item.threadId}`,
        subject: item.subject,
        rawBody: item.body,
        receivedAt: item.receivedAt,
        status: "UNCLASSIFIED",
      },
    });
  }

  revalidatePath("/settings/service-level");
  revalidatePath("/inbox");

  return { added: generated.length };
}

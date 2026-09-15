"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
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

  const { organizationId } = await requireSession();
  const now = new Date();
  const generated = generateMockEmails(count, now);
  const uniquePrefix = `dev-${Date.now()}`;

  const senderCache = new Map<string, string>();
  const accountCache = new Map<string, string>();

  for (const item of generated) {
    let senderId = senderCache.get(item.sender.email);
    if (!senderId) {
      const sender = await prisma.sender.upsert({
        // Sender.email es único compuesto con organizationId, no global.
        where: { organizationId_email: { organizationId, email: item.sender.email } },
        update: {},
        create: {
          organizationId,
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

    let mailAccountId = accountCache.get(item.account.emailAddress);
    if (!mailAccountId) {
      // MailAccount.emailAddress sigue siendo único global a propósito (ver
      // decision_multitenant_organization_user) — si ya existe de OTRA
      // organización, este upsert la dejaría intacta (el `update: {}` no
      // toca organizationId), pero mailAccountId apuntaría a una cuenta
      // ajena. Con datos sintéticos de dev esto no debería pasar en la
      // práctica; se deja tal cual por ser una herramienta interna, no un
      // punto de entrada de producción.
      const account = await prisma.mailAccount.upsert({
        where: { emailAddress: item.account.emailAddress },
        update: {},
        create: {
          organizationId,
          emailAddress: item.account.emailAddress,
          label: item.account.label,
        },
      });
      mailAccountId = account.id;
      accountCache.set(item.account.emailAddress, mailAccountId);
    }

    await prisma.email.create({
      data: {
        organizationId,
        senderId,
        mailAccountId,
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

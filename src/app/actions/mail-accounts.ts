"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { isValidEmail } from "@/lib/utils";
import { recordAuditEvent } from "@/lib/audit/record";

export async function createMailAccount(input: { emailAddress: string; label: string }) {
  const emailAddress = input.emailAddress.trim();
  const label = input.label.trim();

  if (!isValidEmail(emailAddress)) {
    throw new Error("Correo inválido.");
  }
  if (!label) {
    throw new Error("La cuenta necesita un nombre.");
  }

  const account = await prisma.mailAccount.create({
    data: { emailAddress, label },
  });

  await recordAuditEvent({
    actionType: "MANAGE_MAIL_ACCOUNT",
    entityType: "MailAccount",
    entityId: account.id,
    payloadAfter: { emailAddress, label, isActive: true },
    performedBy: "USER",
  });

  revalidatePath("/settings/accounts");
  revalidatePath("/inbox");
  revalidatePath("/audit");

  return account;
}

export async function renameMailAccount(id: string, label: string) {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("La cuenta necesita un nombre.");
  }

  const account = await prisma.mailAccount.findUniqueOrThrow({ where: { id } });
  if (account.label === trimmed) {
    return account;
  }

  const updated = await prisma.mailAccount.update({ where: { id }, data: { label: trimmed } });

  await recordAuditEvent({
    actionType: "MANAGE_MAIL_ACCOUNT",
    entityType: "MailAccount",
    entityId: id,
    payloadBefore: { label: account.label },
    payloadAfter: { label: trimmed },
    performedBy: "USER",
  });

  revalidatePath("/settings/accounts");
  revalidatePath("/inbox");
  revalidatePath("/audit");

  return updated;
}

export async function setMailAccountActive(id: string, isActive: boolean) {
  const account = await prisma.mailAccount.findUniqueOrThrow({ where: { id } });
  const before = { isActive: account.isActive };

  const updated = await prisma.mailAccount.update({ where: { id }, data: { isActive } });

  await recordAuditEvent({
    actionType: "MANAGE_MAIL_ACCOUNT",
    entityType: "MailAccount",
    entityId: id,
    payloadBefore: before,
    payloadAfter: { isActive },
    performedBy: "USER",
  });

  revalidatePath("/settings/accounts");
  revalidatePath("/inbox");
  revalidatePath("/audit");

  return updated;
}

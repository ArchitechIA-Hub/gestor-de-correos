"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { importGmailEmailsForAccount, importNewGmailEmailsForAccount } from "@/lib/gmail/import-service";
import { DEFAULT_GMAIL_IMPORT_LIMIT } from "@/lib/gmail/constants";
export type { ImportGmailResult } from "@/lib/gmail/import-service";

/**
 * Server Action que llama el botón de import manual en /settings/accounts.
 * `organizationId` viene siempre de la sesión, nunca de `mailAccountId` —
 * `importGmailEmailsForAccount` verifica además que esa cuenta pertenezca a
 * la organización de la sesión antes de tocar nada (ver el comentario en
 * `src/lib/gmail/import-service.ts`).
 */
export async function importGmailEmails(mailAccountId: string, limit: number = DEFAULT_GMAIL_IMPORT_LIMIT) {
  const { organizationId } = await requireSession();
  const result = await importGmailEmailsForAccount(organizationId, mailAccountId, limit);

  revalidatePath("/", "layout");
  revalidatePath("/inbox");
  revalidatePath("/settings/accounts");
  revalidatePath("/audit");

  return result;
}

/**
 * Import "de ponerse al día" — hoy solo lo llama el scheduler
 * (`/api/scan/route.ts`, servidor-a-servidor, ya itera cuentas por
 * organización) directo contra `importNewGmailEmailsForAccount`, no contra
 * este Server Action. Se deja exportado aquí por si en el futuro hace falta
 * un botón manual de "ponerse al día" en la UI.
 */
export async function importNewGmailEmails(mailAccountId: string) {
  const { organizationId } = await requireSession();
  const result = await importNewGmailEmailsForAccount(organizationId, mailAccountId);

  if (result.imported > 0) {
    revalidatePath("/", "layout");
    revalidatePath("/inbox");
    revalidatePath("/settings/accounts");
    revalidatePath("/audit");
  }

  return result;
}

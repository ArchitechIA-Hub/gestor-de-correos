"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { sendDigestForOrganization } from "@/lib/digest/send-digest-for-org";
import type { DigestRange } from "@/lib/digest/get-digest-data";

export type SendDigestInput = {
  range: DigestRange;
};

/**
 * Server Action que llama el botón de envío manual del Informe.
 * `organizationId` viene siempre de la sesión (nunca de `input`) y
 * `performedBy` siempre es "USER" aquí — el envío automático semanal
 * ("SYSTEM") pasa por `/api/send-digest` → `sendDigestForOrganization`
 * directo, nunca por este Server Action. Ver el comentario en
 * `src/lib/scan/run-cycle.ts` sobre por qué un Server Action no debe aceptar
 * `organizationId`/`performedBy` como parámetros confiables.
 */
export async function sendDigest(input: SendDigestInput) {
  const { organizationId } = await requireSession();
  const result = await sendDigestForOrganization(organizationId, input.range, "USER");

  revalidatePath("/audit");

  return result;
}

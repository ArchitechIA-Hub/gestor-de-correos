"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { runScanCycle, type ScanOptions, type ScanResult } from "@/lib/scan/run-cycle";

export type { ScanOptions, ScanResult };

/**
 * Server Action que llama la UI (botones "Escanear..."). `organizationId`
 * viene siempre de la sesión, nunca de `options` — ver el comentario en
 * `src/lib/scan/run-cycle.ts` sobre por qué un Server Action no debe aceptar
 * un `organizationId` como parámetro confiable.
 */
export async function scan(options: ScanOptions = {}): Promise<ScanResult> {
  const { organizationId } = await requireSession();
  const result = await runScanCycle(organizationId, options);

  revalidatePath("/", "layout");
  revalidatePath("/inbox");
  revalidatePath("/digest");
  revalidatePath("/audit");
  revalidatePath("/settings/service-level");

  return result;
}

import { NextResponse } from "next/server";
import { runScanCycle } from "@/lib/scan/run-cycle";
import { importNewGmailEmailsForAccount } from "@/lib/gmail/import-service";
import { prisma } from "@/lib/db/prisma";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { recomputeOpenCommitmentPriorities } from "@/lib/priority/recompute";

/**
 * Wrapper HTTP de un ciclo completo del scheduler automático
 * (src/lib/scheduler/auto-scan.ts): importa correo nuevo de Gmail (catch-up
 * con parada temprana, sin costo de IA) y clasifica el backlog resultante,
 * UNA ORGANIZACIÓN A LA VEZ — cada una tiene su propio backlog, nivel de
 * servicio y `ScanCycleLog`. Procesamiento secuencial (no `Promise.all`)
 * a propósito: evita que dos ciclos concurrentes compitan por el mismo lote
 * de `UNCLASSIFIED` si una organización tarda más que el intervalo del tick
 * (ver decision_multitenant_organization_user en memoria).
 *
 * El scheduler corre en instrumentation.ts, fuera del ciclo de vida de una
 * request de Next — llamar a estas funciones ahí directamente rompe
 * revalidatePath (necesita el contexto de una Route Handler/Server Action
 * real). Pasar por este endpoint le da ese contexto.
 */
export async function POST(request: Request) {
  const expectedSecret = process.env.INTERNAL_SCAN_SECRET;
  if (expectedSecret && request.headers.get("x-scan-secret") !== expectedSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const organizations = await prisma.organization.findMany({ where: { isActive: true }, select: { id: true } });
  const now = Date.now();

  const results = [];
  for (const { id: organizationId } of organizations) {
    // Gate por organización: el scheduler llama a este endpoint con un tick
    // corto y fijo (ver src/lib/scheduler/auto-scan.ts), pero cada
    // organización solo debe re-escanearse tan seguido como SU PROPIO nivel
    // de servicio dicta — nunca más seguido, para no disparar costo de IA de
    // más. Se deriva del ScanCycleLog más reciente de esa organización, sin
    // columna nueva.
    const { scanFrequencyMinutes } = await getCurrentServiceLevel(organizationId);
    const lastCycle = await prisma.scanCycleLog.findFirst({
      where: { organizationId },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    const dueAt = lastCycle ? lastCycle.startedAt.getTime() + scanFrequencyMinutes * 60_000 : 0;
    if (now < dueAt) continue;

    const gmailAccounts = await prisma.mailAccount.findMany({
      where: { organizationId, provider: "gmail", isActive: true, googleRefreshToken: { not: null } },
      select: { id: true, emailAddress: true },
    });

    let imported = 0;
    for (const account of gmailAccounts) {
      try {
        const result = await importNewGmailEmailsForAccount(organizationId, account.id);
        imported += result.imported;
      } catch (error) {
        // Un fallo puntual de Gmail (token revocado, rate limit) no debe
        // tumbar el ciclo de clasificación del resto del backlog ya importado,
        // ni el de las demás organizaciones.
        console.error(`[import] catch-up falló para ${account.emailAddress} (org ${organizationId}):`, error);
      }
    }

    const scanResult = await runScanCycle(organizationId);

    try {
      await recomputeOpenCommitmentPriorities(organizationId);
    } catch (error) {
      // No debe tumbar el ciclo de escaneo del backlog si esto falla.
      console.error(`[scan] error recalculando prioridades por paso del tiempo (org ${organizationId}):`, error);
    }

    const { level, backlogCount } = await getCurrentServiceLevel(organizationId);

    await prisma.scanCycleLog.create({
      data: {
        organizationId,
        emailsImported: imported,
        emailsScanned: scanResult.scanned,
        inputTokens: scanResult.inputTokens,
        outputTokens: scanResult.outputTokens,
        totalTokens: scanResult.totalTokens,
        serviceLevel: level,
        backlogCount,
      },
    });

    results.push({ organizationId, imported, ...scanResult, serviceLevel: level, backlogCount });
  }

  return NextResponse.json({ organizations: results });
}

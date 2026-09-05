import { prisma } from "@/lib/db/prisma";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { recomputeOpenCommitmentPriorities } from "@/lib/priority/recompute";

declare global {
  var __autoScanTimer: ReturnType<typeof setTimeout> | undefined;
}

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const FALLBACK_RETRY_MINUTES = 5;
const FIRST_CYCLE_DELAY_MINUTES = 0.2; // ~12s de margen para que el servidor termine de levantar

function isAutoScanEnabled(): boolean {
  return process.env.AUTO_SCAN_ENABLED !== "false";
}

function scheduleNext(minutes: number) {
  globalThis.__autoScanTimer = setTimeout(runCycle, minutes * 60 * 1000);
}

async function runCycle() {
  try {
    const pendingCount = await prisma.email.count({ where: { status: "UNCLASSIFIED" } });

    if (pendingCount > 0) {
      const response = await fetch(`${APP_URL}/api/scan`, {
        method: "POST",
        headers: process.env.INTERNAL_SCAN_SECRET ? { "x-scan-secret": process.env.INTERNAL_SCAN_SECRET } : {},
      });
      if (!response.ok) throw new Error(`El endpoint de escaneo respondió ${response.status}`);
      const result = await response.json();
      console.log(
        `[auto-scan] escaneados ${result.scanned} · ${result.commitmentsDetected} compromisos · ${result.urgentDetected} urgentes · ${result.marketingDetected} marketing`
      );
    }

    try {
      const { updated } = await recomputeOpenCommitmentPriorities();
      if (updated > 0) console.log(`[auto-scan] recalculados ${updated} correos con compromisos abiertos`);
    } catch (error) {
      // No debe tumbar el ciclo de escaneo de backlog si esto falla.
      console.error("[auto-scan] error recalculando prioridades por paso del tiempo:", error);
    }

    const { scanFrequencyMinutes } = await getCurrentServiceLevel();
    scheduleNext(scanFrequencyMinutes);
  } catch (error) {
    console.error(`[auto-scan] error en el ciclo, reintentando en ${FALLBACK_RETRY_MINUTES} min:`, error);
    scheduleNext(FALLBACK_RETRY_MINUTES);
  }
}

/**
 * Arranca el escaneo periódico automático respetando la frecuencia del nivel
 * de servicio activo (CLAUDE.md: cada nivel define su propia cadencia de
 * escaneo). Se reprograma después de cada ciclo con la frecuencia recién
 * calculada, porque el backlog —y por tanto el nivel— puede cambiar entre
 * ciclos. Requiere que el proceso del servidor (`next dev` / `next start`)
 * siga vivo; no funciona en un entorno serverless sin timers persistentes.
 *
 * IMPORTANTE: cada ciclo con backlog pendiente dispara llamadas reales (con
 * costo) a la API de IA. Se puede desactivar con AUTO_SCAN_ENABLED=false.
 */
export function startAutoScanScheduler() {
  if (globalThis.__autoScanTimer) return; // ya arrancado (hot reload en dev)

  if (!isAutoScanEnabled()) {
    console.log("[auto-scan] deshabilitado (AUTO_SCAN_ENABLED=false)");
    return;
  }

  console.log("[auto-scan] iniciado — respeta la frecuencia del nivel de servicio activo");
  scheduleNext(FIRST_CYCLE_DELAY_MINUTES);
}

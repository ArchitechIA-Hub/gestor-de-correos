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
    // Siempre se llama, aunque el backlog ya clasificado esté en 0: el paso
    // de import (sin costo de IA) es el que trae correo nuevo, y solo se ve
    // reflejado en el backlog DESPUÉS de correr — filtrar por backlog previo
    // aquí dejaría el import sin correr nunca en el caso normal de "ya estoy
    // al día".
    const response = await fetch(`${APP_URL}/api/scan`, {
      method: "POST",
      headers: process.env.INTERNAL_SCAN_SECRET ? { "x-scan-secret": process.env.INTERNAL_SCAN_SECRET } : {},
    });
    if (!response.ok) throw new Error(`El endpoint de escaneo respondió ${response.status}`);
    const result = await response.json();
    console.log(
      `[auto-scan] importados ${result.imported} · escaneados ${result.scanned} · ${result.commitmentsDetected} compromisos · ${result.urgentDetected} urgentes · ${result.marketingDetected} marketing · ${result.totalTokens} tokens`
    );

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
 * IMPORTANTE: cada ciclo llama a /api/scan (import de Gmail + clasificación).
 * El import no tiene costo de IA; la clasificación solo llama a la IA sobre
 * los correos que de verdad quedaron sin clasificar (0 costo si no hay
 * ninguno). Se puede desactivar todo el ciclo con AUTO_SCAN_ENABLED=false.
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

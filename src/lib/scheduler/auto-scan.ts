declare global {
  var __autoScanTimer: ReturnType<typeof setInterval> | undefined;
}

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

// Tick fijo y corto (no una frecuencia autocalculada): con varias
// organizaciones, cada una puede necesitar una cadencia distinta según su
// propio backlog (ver CLAUDE.md), así que el gate de "¿ya le toca?" vive por
// organización dentro de /api/scan (comparado contra su ScanCycleLog más
// reciente) — este tick solo decide cada cuánto se pregunta, nunca cada
// cuánto se re-escanea de verdad. 1 minuto es barato (la propia query es
// ligera) y deja margen sobrado para el nivel más exigente (cada 15 min).
const TICK_MINUTES = 1;

function isAutoScanEnabled(): boolean {
  return process.env.AUTO_SCAN_ENABLED !== "false";
}

// Evita que un tick se solape con el anterior si un ciclo (import + scan de
// TODAS las organizaciones vencidas) tarda más que el intervalo del tick —
// ver riesgo de "overlap de ciclos" en decision_multitenant_organization_user.
let tickInFlight = false;

async function runTick() {
  if (tickInFlight) {
    console.warn("[auto-scan] tick anterior todavía en curso, se salta este.");
    return;
  }
  tickInFlight = true;
  try {
    const response = await fetch(`${APP_URL}/api/scan`, {
      method: "POST",
      headers: process.env.INTERNAL_SCAN_SECRET ? { "x-scan-secret": process.env.INTERNAL_SCAN_SECRET } : {},
    });
    if (!response.ok) throw new Error(`El endpoint de escaneo respondió ${response.status}`);
    const result = await response.json();
    const orgResults = (result.organizations ?? []) as Array<{
      organizationId: string;
      imported: number;
      scanned: number;
      commitmentsDetected: number;
      urgentDetected: number;
      marketingDetected: number;
      totalTokens: number;
    }>;
    for (const r of orgResults) {
      console.log(
        `[auto-scan] org ${r.organizationId}: importados ${r.imported} · escaneados ${r.scanned} · ${r.commitmentsDetected} compromisos · ${r.urgentDetected} urgentes · ${r.marketingDetected} marketing · ${r.totalTokens} tokens`
      );
    }
  } catch (error) {
    console.error("[auto-scan] error en el tick:", error);
  } finally {
    tickInFlight = false;
  }
}

/**
 * Arranca el tick periódico automático (import + escaneo, gateado por
 * organización dentro de /api/scan — ver runTick). Requiere que el proceso
 * del servidor (`next dev` / `next start`) siga vivo; no funciona en un
 * entorno serverless sin timers persistentes. Se puede desactivar con
 * AUTO_SCAN_ENABLED=false.
 */
export function startAutoScanScheduler() {
  if (globalThis.__autoScanTimer) return; // ya arrancado (hot reload en dev)

  if (!isAutoScanEnabled()) {
    console.log("[auto-scan] deshabilitado (AUTO_SCAN_ENABLED=false)");
    return;
  }

  console.log(`[auto-scan] iniciado — tick cada ${TICK_MINUTES} min, cadencia real gateada por organización`);
  globalThis.__autoScanTimer = setInterval(runTick, TICK_MINUTES * 60 * 1000);
  void runTick(); // primer ciclo inmediato, sin esperar el primer intervalo
}

declare global {
  var __autoDigestTimer: ReturnType<typeof setInterval> | undefined;
}

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

// Tick fijo: la resolución que importa es "jueves 7am", no minuto a minuto,
// así que un intervalo más largo que el de auto-scan.ts es suficiente. El
// gate real ("¿ya le tocó esta semana a esta organización, en su propia zona
// horaria?") vive dentro de /api/send-digest, por organización.
const TICK_MINUTES = 20;

function isAutoDigestEnabled(): boolean {
  // Reutiliza el mismo interruptor que el scheduler de escaneo — ambos son
  // "automatizaciones de fondo que llaman a /api desde el servidor".
  return process.env.AUTO_SCAN_ENABLED !== "false";
}

let tickInFlight = false;

async function runTick() {
  if (tickInFlight) {
    console.warn("[auto-digest] tick anterior todavía en curso, se salta este.");
    return;
  }
  tickInFlight = true;
  try {
    const response = await fetch(`${APP_URL}/api/send-digest`, {
      method: "POST",
      headers: process.env.INTERNAL_SCAN_SECRET ? { "x-scan-secret": process.env.INTERNAL_SCAN_SECRET } : {},
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`El endpoint de informe respondió ${response.status}: ${body.error ?? "sin detalle"}`);
    }
    const result = await response.json();
    const orgResults = (result.organizations ?? []) as Array<{
      organizationId: string;
      recipientEmail?: string;
      error?: string;
    }>;
    for (const r of orgResults) {
      if (r.error) {
        console.error(`[auto-digest] org ${r.organizationId}: ${r.error}`);
      } else {
        console.log(`[auto-digest] org ${r.organizationId}: informe semanal enviado a ${r.recipientEmail}`);
      }
    }
  } catch (error) {
    console.error("[auto-digest] error en el tick:", error);
  } finally {
    tickInFlight = false;
  }
}

/**
 * Arranca el tick periódico del envío automático del Informe (jueves 7am,
 * hora de cada organización — gateado dentro de /api/send-digest). Igual que
 * el scheduler de escaneo (src/lib/scheduler/auto-scan.ts), requiere que el
 * proceso del servidor siga vivo. Se puede desactivar con
 * AUTO_SCAN_ENABLED=false.
 */
export function startAutoDigestScheduler() {
  if (globalThis.__autoDigestTimer) return; // ya arrancado (hot reload en dev)

  if (!isAutoDigestEnabled()) {
    console.log("[auto-digest] deshabilitado (AUTO_SCAN_ENABLED=false)");
    return;
  }

  console.log(`[auto-digest] iniciado — tick cada ${TICK_MINUTES} min, cadencia real gateada por organización`);
  globalThis.__autoDigestTimer = setInterval(runTick, TICK_MINUTES * 60 * 1000);
  void runTick();
}

import { getUserTimeZone } from "@/lib/settings";
import { getNextWeeklyOccurrence } from "./next-occurrence";

declare global {
  var __autoDigestTimer: ReturnType<typeof setTimeout> | undefined;
}

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const FALLBACK_RETRY_MINUTES = 30;

// Jueves 7am, hora del usuario (getUserTimeZone) — decisión del usuario
// 2026-09-12. Cambiar solo estos dos valores si se pide otro día/hora.
const DIGEST_WEEKDAY = 4; // 0 = domingo ... 4 = jueves
const DIGEST_HOUR = 7;

function isAutoDigestEnabled(): boolean {
  // Reutiliza el mismo interruptor que el scheduler de escaneo — ambos son
  // "automatizaciones de fondo que llaman a /api desde el servidor".
  return process.env.AUTO_SCAN_ENABLED !== "false";
}

async function scheduleNext() {
  const timeZone = await getUserTimeZone();
  const next = getNextWeeklyOccurrence(new Date(), timeZone, { weekday: DIGEST_WEEKDAY, hour: DIGEST_HOUR });
  const delayMs = Math.max(1000, next.getTime() - Date.now());

  globalThis.__autoDigestTimer = setTimeout(runCycle, delayMs);
  console.log(`[auto-digest] próximo informe automático: ${next.toISOString()} (en ${Math.round(delayMs / 60000)} min)`);
}

async function runCycle() {
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
    console.log(`[auto-digest] informe semanal enviado a ${result.recipientEmail}`);
    await scheduleNext();
  } catch (error) {
    console.error(`[auto-digest] error enviando el informe, reintentando en ${FALLBACK_RETRY_MINUTES} min:`, error);
    globalThis.__autoDigestTimer = setTimeout(runCycle, FALLBACK_RETRY_MINUTES * 60 * 1000);
  }
}

/**
 * Arranca el envío automático semanal del Informe (jueves 7am hora del
 * usuario). Igual que el scheduler de escaneo (src/lib/scheduler/auto-scan.ts),
 * requiere que el proceso del servidor siga vivo — no funciona en
 * serverless sin timers persistentes. Se puede desactivar con
 * AUTO_SCAN_ENABLED=false.
 */
export function startAutoDigestScheduler() {
  if (globalThis.__autoDigestTimer) return; // ya arrancado (hot reload en dev)

  if (!isAutoDigestEnabled()) {
    console.log("[auto-digest] deshabilitado (AUTO_SCAN_ENABLED=false)");
    return;
  }

  void scheduleNext();
}

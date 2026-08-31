/**
 * Formateadores de fecha compartidos. Todos reciben `timeZone` explícito
 * (la zona configurada por el usuario, ver `getUserTimeZone` en servidor y
 * `useTimeZone` en cliente) para que la hora mostrada sea siempre la suya y
 * no la del servidor / navegador. El guard de `null` se queda en cada call
 * site (ya hacen `x ? fmt(x) : "—"`).
 */
const LOCALE = "es-ES";

/** Día + mes corto + hora — listas densas (bandeja, auditoría, prioridades, panel, alertas). */
export function formatShortDateTime(date: Date, timeZone: string): string {
  return date.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** Día + mes largo + año + hora — cabeceras de detalle (correo, enviados, borrador aprobado). */
export function formatLongDateTime(date: Date, timeZone: string): string {
  return date.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** Día + mes largo + año, sin hora — rango del informe. */
export function formatLongDate(date: Date, timeZone: string): string {
  return date.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  });
}

/** Solo hora:min — confirmación de envío del informe. */
export function formatTime(date: Date, timeZone: string): string {
  return date.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

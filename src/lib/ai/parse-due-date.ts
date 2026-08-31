import { getTimeZoneOffset } from "@/lib/format/timezone";

/**
 * Convierte el `dueDateISO` que devuelve la IA en un `Date`.
 *
 * - Si el string ya trae zona (`Z` o `±HH:MM`), se respeta tal cual.
 * - Si viene sin zona (la IA a veces la omite pese al prompt), se interpreta
 *   en la zona horaria del usuario: se completa la hora a medianoche si falta
 *   y se anexa el desfase de esa zona.
 *
 * Exacto para la zona por defecto (`America/Bogota`, offset fijo −05:00).
 * En zonas con horario de verano puede haber ≤1h de error en la ventana
 * previa a un cambio de DST — aceptable para una heurística de fecha límite.
 */
export function parseDueDate(iso: string | null, timeZone: string): Date | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;

  // ¿Ya trae zona explícita al final? (Z, +HH:MM, -HH:MM, +HHMM)
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const hasTime = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed);
  const withTime = hasTime ? trimmed : `${trimmed.slice(0, 10)}T00:00:00`;

  // Elegimos el offset a partir de una lectura provisional (naïve como UTC),
  // suficiente para resolver el DST salvo en la hora exacta del cambio.
  const provisional = new Date(`${withTime}Z`);
  if (Number.isNaN(provisional.getTime())) return null;

  const offset = getTimeZoneOffset(provisional, timeZone);
  const d = new Date(`${withTime}${offset}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

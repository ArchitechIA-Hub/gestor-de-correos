/**
 * Zona horaria por defecto del producto. Coincide con el `@default` de
 * `AppSettings.timeZone` en el schema — mantener sincronizados.
 */
export const DEFAULT_TIME_ZONE = "America/Bogota";

/** Opciones ofrecidas en el selector de Ajustes. */
export const COMMON_TIME_ZONES: { id: string; label: string }[] = [
  { id: "America/Bogota", label: "Bogotá (COT)" },
  { id: "America/Mexico_City", label: "Ciudad de México (CST)" },
  { id: "America/New_York", label: "Nueva York (ET)" },
  { id: "America/Santiago", label: "Santiago (CLT)" },
  { id: "America/Argentina/Buenos_Aires", label: "Buenos Aires (ART)" },
  { id: "America/Sao_Paulo", label: "São Paulo (BRT)" },
  { id: "Europe/Madrid", label: "Madrid (CET)" },
  { id: "Europe/London", label: "Londres (GMT)" },
  { id: "UTC", label: "UTC" },
];

/** `true` si el runtime reconoce la zona (vía `Intl`). */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Desfase de la zona respecto de UTC para una fecha dada, en formato
 * `"+HH:MM"` / `"-HH:MM"` (p. ej. `"-05:00"`). Usa el offset real de esa
 * fecha, así que respeta el horario de verano donde aplique.
 */
export function getTimeZoneOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  // "GMT-05:00" -> "-05:00"; "GMT" (UTC) -> "+00:00"
  const match = raw.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : "+00:00";
}

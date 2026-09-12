import { getTimeZoneOffset } from "@/lib/format/timezone";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getWallClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Algunos locales/ICU devuelven "24" para medianoche en hour12:false.
  const hour = get("hour") === "24" ? 0 : Number(get("hour"));

  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
  };
}

function parseOffsetToMinutes(offset: string): number {
  const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

export type WeeklyTarget = { weekday: number; hour: number; minute?: number };

/**
 * Próximo instante (UTC) en que es un día/hora concretos EN LA ZONA HORARIA
 * DADA — p. ej. "el próximo jueves a las 7am hora Bogotá". Si `now` cae
 * justo en ese día/hora (o después) en esa zona, devuelve la semana
 * siguiente: nunca "ahora mismo" ni el pasado, para no reencolar el mismo
 * ciclo dos veces seguidas.
 *
 * `weekday` sigue la convención de `Date.getDay()` (0 = domingo ... 6 =
 * sábado), pero calculado en la zona horaria dada, no en la del servidor.
 */
export function getNextWeeklyOccurrence(now: Date, timeZone: string, target: WeeklyTarget): Date {
  const minute = target.minute ?? 0;
  const wall = getWallClockParts(now, timeZone);

  let daysUntil = (target.weekday - wall.weekday + 7) % 7;
  const alreadyPastToday =
    daysUntil === 0 && (wall.hour > target.hour || (wall.hour === target.hour && wall.minute >= minute));
  if (alreadyPastToday) daysUntil = 7;

  // No es un instante UTC real: son los componentes de la fecha/hora de
  // pared objetivo, interpretados como si fueran UTC, solo para poder
  // calcular el offset vigente en esa fecha (respeta horario de verano).
  const wallAsUtcGuess = Date.UTC(wall.year, wall.month - 1, wall.day + daysUntil, target.hour, minute, 0);

  const offsetMinutes = parseOffsetToMinutes(getTimeZoneOffset(new Date(wallAsUtcGuess), timeZone));
  return new Date(wallAsUtcGuess - offsetMinutes * 60000);
}

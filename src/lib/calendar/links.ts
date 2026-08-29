const DEFAULT_DURATION_MINUTES = 30;

function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/**
 * Link de "agregar evento" de Google Calendar — no requiere ningún scope ni
 * autenticación (es un endpoint público de render con parámetros en la URL),
 * a diferencia de escribir el evento vía la API de Calendar.
 */
export function buildGoogleCalendarUrl(params: { title: string; description: string; start: Date; durationMinutes?: number }): string {
  const end = new Date(params.start.getTime() + (params.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000);
  const search = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${toIcsUtc(params.start)}/${toIcsUtc(end)}`,
    details: params.description,
  });
  return `https://calendar.google.com/calendar/render?${search.toString()}`;
}

/**
 * Archivo .ics estándar (RFC 5545) — lo abren tanto Google Calendar como
 * Apple/iOS Calendar y Outlook, sin integración específica por plataforma.
 */
export function buildIcsContent(params: { uid: string; title: string; description: string; start: Date; durationMinutes?: number }): string {
  const end = new Date(params.start.getTime() + (params.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000);
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bandeja Ejecutiva//Compromisos//ES",
    "BEGIN:VEVENT",
    `UID:${params.uid}@bandeja-ejecutiva`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(params.start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escape(params.title)}`,
    `DESCRIPTION:${escape(params.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

import { describe, it, expect } from "vitest";
import { getNextWeeklyOccurrence } from "./next-occurrence";

const BOGOTA = "America/Bogota"; // UTC-5, sin horario de verano
const THURSDAY = 4;

describe("getNextWeeklyOccurrence", () => {
  it("calcula el próximo jueves 7am Bogotá desde un lunes", () => {
    // Lunes 2026-09-14 10:00 UTC = 05:00 Bogotá
    const now = new Date("2026-09-14T10:00:00Z");
    const next = getNextWeeklyOccurrence(now, BOGOTA, { weekday: THURSDAY, hour: 7 });

    // Jueves 2026-09-17 07:00 Bogotá = 12:00 UTC
    expect(next.toISOString()).toBe("2026-09-17T12:00:00.000Z");
  });

  it("si ya es jueves pero antes de las 7am Bogotá, dispara hoy mismo", () => {
    // Jueves 2026-09-17 06:00 UTC = 01:00 Bogotá (antes de las 7am)
    const now = new Date("2026-09-17T06:00:00Z");
    const next = getNextWeeklyOccurrence(now, BOGOTA, { weekday: THURSDAY, hour: 7 });

    expect(next.toISOString()).toBe("2026-09-17T12:00:00.000Z");
  });

  it("si ya es jueves y ya pasaron las 7am Bogotá, salta a la semana siguiente", () => {
    // Jueves 2026-09-17 13:00 UTC = 08:00 Bogotá (ya pasó)
    const now = new Date("2026-09-17T13:00:00Z");
    const next = getNextWeeklyOccurrence(now, BOGOTA, { weekday: THURSDAY, hour: 7 });

    expect(next.toISOString()).toBe("2026-09-24T12:00:00.000Z");
  });

  it("si es exactamente el minuto objetivo, cuenta como ya pasado (evita re-disparar)", () => {
    // Jueves 2026-09-17 12:00:00 UTC = 07:00:00 Bogotá exacto
    const now = new Date("2026-09-17T12:00:00Z");
    const next = getNextWeeklyOccurrence(now, BOGOTA, { weekday: THURSDAY, hour: 7 });

    expect(next.toISOString()).toBe("2026-09-24T12:00:00.000Z");
  });
});

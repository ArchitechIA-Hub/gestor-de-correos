import { describe, it, expect } from "vitest";
import { parseDueDate } from "./parse-due-date";

describe("parseDueDate", () => {
  it("devuelve null para entrada vacía", () => {
    expect(parseDueDate(null, "America/Bogota")).toBeNull();
    expect(parseDueDate("", "America/Bogota")).toBeNull();
  });

  it("respeta un desfase explícito", () => {
    expect(parseDueDate("2026-09-01T09:00:00-05:00", "Europe/Madrid")?.toISOString()).toBe(
      "2026-09-01T14:00:00.000Z"
    );
  });

  it("respeta un timestamp en UTC (Z)", () => {
    expect(parseDueDate("2026-09-01T09:00:00Z", "America/Bogota")?.toISOString()).toBe(
      "2026-09-01T09:00:00.000Z"
    );
  });

  it("interpreta una fecha-hora sin zona en la zona del usuario", () => {
    // 09:00 en Bogotá (−05:00) = 14:00 UTC
    expect(parseDueDate("2026-09-01T09:00:00", "America/Bogota")?.toISOString()).toBe(
      "2026-09-01T14:00:00.000Z"
    );
  });

  it("completa a medianoche una fecha sin hora", () => {
    // 00:00 en Bogotá = 05:00 UTC
    expect(parseDueDate("2026-09-01", "America/Bogota")?.toISOString()).toBe(
      "2026-09-01T05:00:00.000Z"
    );
  });
});

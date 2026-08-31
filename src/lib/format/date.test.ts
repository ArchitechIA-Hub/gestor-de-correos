import { describe, it, expect } from "vitest";
import { formatShortDateTime, formatLongDate, formatTime } from "./date";

describe("formatShortDateTime", () => {
  const d = new Date("2026-01-15T02:30:00Z");

  it("usa la zona horaria pasada", () => {
    // 02:30 UTC = 21:30 del día anterior en Bogotá (−05:00)
    expect(formatShortDateTime(d, "America/Bogota")).toBe("14 ene, 21:30");
    // 02:30 UTC = 03:30 en Madrid (+01:00 en enero)
    expect(formatShortDateTime(d, "Europe/Madrid")).toBe("15 ene, 03:30");
  });
});

describe("formatLongDate", () => {
  it("no incluye hora", () => {
    const d = new Date("2026-09-01T23:00:00Z");
    // 23:00 UTC del 1 sep = 18:00 del 1 sep en Bogotá
    expect(formatLongDate(d, "America/Bogota")).toBe("1 de septiembre de 2026");
  });
});

describe("formatTime", () => {
  it("solo hora y minuto en la zona dada", () => {
    const d = new Date("2026-01-15T02:30:00Z");
    expect(formatTime(d, "America/Bogota")).toBe("21:30");
    expect(formatTime(d, "UTC")).toBe("02:30");
  });
});

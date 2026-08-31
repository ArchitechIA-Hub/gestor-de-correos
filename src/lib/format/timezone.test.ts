import { describe, it, expect } from "vitest";
import { getTimeZoneOffset, isValidTimeZone } from "./timezone";

describe("isValidTimeZone", () => {
  it("acepta zonas IANA reales", () => {
    expect(isValidTimeZone("America/Bogota")).toBe(true);
    expect(isValidTimeZone("Europe/Madrid")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rechaza cadenas que no son zonas", () => {
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("No/Existe")).toBe(false);
  });
});

describe("getTimeZoneOffset", () => {
  const jan = new Date("2026-01-15T12:00:00Z");

  it("da el offset fijo de Bogotá", () => {
    expect(getTimeZoneOffset(jan, "America/Bogota")).toBe("-05:00");
  });

  it("da +00:00 para UTC", () => {
    expect(getTimeZoneOffset(jan, "UTC")).toBe("+00:00");
  });

  it("respeta el horario de verano", () => {
    const summer = new Date("2026-07-15T12:00:00Z");
    expect(getTimeZoneOffset(jan, "Europe/Madrid")).toBe("+01:00");
    expect(getTimeZoneOffset(summer, "Europe/Madrid")).toBe("+02:00");
  });
});

import { describe, it, expect } from "vitest";
import { getServiceLevel } from "./service-level";

describe("getServiceLevel", () => {
  it("Nivel 1 (Ligero) para backlog hasta 200", () => {
    expect(getServiceLevel(0).level).toBe(1);
    expect(getServiceLevel(200).level).toBe(1);
  });

  it("cruza a Nivel 2 (Moderado) exactamente en 201", () => {
    expect(getServiceLevel(200).level).toBe(1);
    expect(getServiceLevel(201).level).toBe(2);
    expect(getServiceLevel(800).level).toBe(2);
  });

  it("cruza a Nivel 3 (Alto) exactamente en 801", () => {
    expect(getServiceLevel(800).level).toBe(2);
    expect(getServiceLevel(801).level).toBe(3);
    expect(getServiceLevel(2500).level).toBe(3);
  });

  it("cruza a Nivel 4 (Crítico) exactamente en 2501", () => {
    expect(getServiceLevel(2500).level).toBe(3);
    expect(getServiceLevel(2501).level).toBe(4);
    expect(getServiceLevel(1_000_000).level).toBe(4);
  });

  it("borradores, alertas y modo rescate están activos en todos los niveles (decisión temporal 2026-08-21, ver constants.ts)", () => {
    const allOn = { draftGeneration: true, urgentPushAlerts: true, rescueMode: true };

    expect(getServiceLevel(50).features).toEqual(allOn);
    expect(getServiceLevel(500).features).toEqual(allOn);
    expect(getServiceLevel(1000).features).toEqual(allOn);
    expect(getServiceLevel(5000).features).toEqual(allOn);
  });
});

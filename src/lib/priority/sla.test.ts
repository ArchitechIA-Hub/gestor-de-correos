import { describe, it, expect } from "vitest";
import { computeVipSlaStatus } from "./sla";
import { VIP_SLA_HOURS } from "./constants";

const NOW = new Date("2026-08-21T12:00:00Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

describe("computeVipSlaStatus", () => {
  it("no aplica a remitentes no-VIP", () => {
    const status = computeVipSlaStatus(
      { isVip: false, receivedAt: hoursAgo(VIP_SLA_HOURS + 10), hasApprovedResponse: false },
      NOW
    );
    expect(status).toBe("not_applicable");
  });

  it("cumple el SLA si ya hay una respuesta aprobada, sin importar cuánto haya pasado", () => {
    const status = computeVipSlaStatus(
      { isVip: true, receivedAt: hoursAgo(VIP_SLA_HOURS + 100), hasApprovedResponse: true },
      NOW
    );
    expect(status).toBe("compliant");
  });

  it("incumple el SLA si un VIP lleva más de la ventana configurada sin respuesta aprobada", () => {
    const status = computeVipSlaStatus(
      { isVip: true, receivedAt: hoursAgo(VIP_SLA_HOURS + 1), hasApprovedResponse: false },
      NOW
    );
    expect(status).toBe("breached");
  });

  it("sigue dentro de SLA si un VIP aún no supera la ventana sin respuesta", () => {
    const status = computeVipSlaStatus(
      { isVip: true, receivedAt: hoursAgo(VIP_SLA_HOURS - 1), hasApprovedResponse: false },
      NOW
    );
    expect(status).toBe("compliant");
  });
});

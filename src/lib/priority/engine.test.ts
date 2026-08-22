import { describe, it, expect } from "vitest";
import { isUrgentByDeadline, computePriorityScore, prioritize } from "./engine";

const NOW = new Date("2026-08-21T12:00:00Z");

function hoursFromNow(hours: number): Date {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000);
}

describe("isUrgentByDeadline", () => {
  it("marca urgente un compromiso vencido en menos de 48h, incluso en Nivel 1", () => {
    expect(isUrgentByDeadline(hoursFromNow(47), NOW)).toBe(true);
    expect(isUrgentByDeadline(hoursFromNow(0), NOW)).toBe(true);
    expect(isUrgentByDeadline(hoursFromNow(-5), NOW)).toBe(true); // ya vencido
  });

  it("no marca urgente un compromiso a más de 48h", () => {
    expect(isUrgentByDeadline(hoursFromNow(49), NOW)).toBe(false);
    expect(isUrgentByDeadline(hoursFromNow(24 * 10), NOW)).toBe(false);
  });

  it("no marca urgente si no hay fecha de vencimiento", () => {
    expect(isUrgentByDeadline(null, NOW)).toBe(false);
    expect(isUrgentByDeadline(undefined, NOW)).toBe(false);
  });
});

describe("computePriorityScore / prioritize", () => {
  it("un remitente VIP se prioriza sobre un correo no-VIP cronológicamente más reciente", () => {
    const vipOlder = {
      id: "vip-older",
      receivedAt: hoursFromNow(-10),
      isVip: true,
      nearestDueAt: null,
    };
    const nonVipNewer = {
      id: "non-vip-newer",
      receivedAt: hoursFromNow(-1),
      isVip: false,
      nearestDueAt: null,
    };

    const [first] = prioritize([nonVipNewer, vipOlder], NOW);
    expect(first.id).toBe("vip-older");
  });

  it("combina urgencia + VIP, no usa orden cronológico como fallback silencioso", () => {
    const urgentNonVip = {
      id: "urgent-non-vip",
      receivedAt: hoursFromNow(-5),
      isVip: false,
      nearestDueAt: hoursFromNow(1),
    };
    const vipNoDeadline = {
      id: "vip-no-deadline",
      receivedAt: hoursFromNow(-1),
      isVip: true,
      nearestDueAt: null,
    };

    const scoreUrgent = computePriorityScore(urgentNonVip, NOW);
    const scoreVip = computePriorityScore(vipNoDeadline, NOW);

    // Ambas señales contribuyen: un compromiso inminente pesa más que ser VIP sin compromiso.
    expect(scoreUrgent).toBeGreaterThan(scoreVip);
  });

  it("usa orden cronológico solo como desempate entre scores idénticos", () => {
    const a = { id: "a", receivedAt: hoursFromNow(-5), isVip: false, nearestDueAt: null };
    const b = { id: "b", receivedAt: hoursFromNow(-1), isVip: false, nearestDueAt: null };

    const [first] = prioritize([a, b], NOW);
    expect(first.id).toBe("b"); // más reciente, único criterio disponible al empatar
  });
});

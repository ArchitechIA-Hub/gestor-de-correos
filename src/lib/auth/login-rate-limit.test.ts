import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
  __resetLoginRateLimitForTests,
} from "./login-rate-limit";

const target = { email: "victima@test.local", ip: "1.2.3.4" as string | null };

beforeEach(() => {
  __resetLoginRateLimitForTests();
  vi.useRealTimers();
});

describe("login rate limit (fuerza bruta)", () => {
  it("no bloquea antes de agotar los intentos gratis", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkLoginRateLimit(target)).toEqual({ limited: false });
      recordLoginFailure(target);
    }
    // La 6ta falla ya debería bloquear, pero el chequeo ANTES de esa falla
    // (arriba, 5 fallas registradas) todavía no debe estar bloqueado.
    expect(checkLoginRateLimit(target)).toEqual({ limited: false });
  });

  it("bloquea tras superar el umbral de intentos gratis", () => {
    for (let i = 0; i < 6; i++) recordLoginFailure(target);
    const result = checkLoginRateLimit(target);
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("el bloqueo escala (backoff exponencial) con más fallas", () => {
    for (let i = 0; i < 6; i++) recordLoginFailure(target);
    const first = checkLoginRateLimit(target);
    for (let i = 0; i < 3; i++) recordLoginFailure(target);
    const second = checkLoginRateLimit(target);

    expect(first.limited && second.limited).toBe(true);
    if (first.limited && second.limited) {
      expect(second.retryAfterMs).toBeGreaterThan(first.retryAfterMs);
    }
  });

  it("un login exitoso limpia el contador (vuelve a haber intentos gratis)", () => {
    for (let i = 0; i < 6; i++) recordLoginFailure(target);
    expect(checkLoginRateLimit(target).limited).toBe(true);

    recordLoginSuccess(target);

    expect(checkLoginRateLimit(target)).toEqual({ limited: false });
  });

  it("el bloqueo expira solo con el paso del tiempo", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 6; i++) recordLoginFailure(target);
      expect(checkLoginRateLimit(target).limited).toBe(true);

      vi.advanceTimersByTime(31_000); // pasado el lockout base de 30s

      expect(checkLoginRateLimit(target)).toEqual({ limited: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("bloquear por IP no depende de acertar el email exacto (protege contra rociar varios emails)", () => {
    const sameIpDifferentEmail = { email: "otro@test.local", ip: target.ip };
    for (let i = 0; i < 6; i++) recordLoginFailure(target);

    expect(checkLoginRateLimit(sameIpDifferentEmail).limited).toBe(true);
  });

  it("bloquear por email no depende de la IP (protege la cuenta aunque el atacante rote de IP)", () => {
    const sameEmailDifferentIp = { email: target.email, ip: "9.9.9.9" };
    for (let i = 0; i < 6; i++) recordLoginFailure(target);

    expect(checkLoginRateLimit(sameEmailDifferentIp).limited).toBe(true);
  });

  it("una IP null no rompe nada (sigue protegiendo por email)", () => {
    const noIp = { email: "sin-ip@test.local", ip: null };
    for (let i = 0; i < 6; i++) recordLoginFailure(noIp);

    expect(checkLoginRateLimit(noIp).limited).toBe(true);
  });
});

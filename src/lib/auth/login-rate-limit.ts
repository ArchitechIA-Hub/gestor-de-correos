/**
 * Rate limit de fuerza bruta para `login()` (src/app/login/actions.ts).
 * Antes de este cambio no había ningún límite: un atacante podía probar
 * contraseñas contra un email conocido (o rociar contraseñas comunes contra
 * muchos emails desde una IP) tan rápido como el servidor respondiera.
 *
 * Backoff exponencial por clave (email normalizado o IP), en memoria del
 * proceso — sin infraestructura nueva:
 *   - Las primeras FREE_ATTEMPTS fallas no generan bloqueo.
 *   - Cada falla adicional duplica el bloqueo (BASE_LOCKOUT_MS, luego x2, x4,
 *     ...) hasta un tope (MAX_LOCKOUT_MS).
 *   - Un login exitoso limpia el contador de esa clave.
 *
 * LIMITACIÓN CONOCIDA (documentada a propósito, ver tarea de endurecimiento):
 * este estado vive en memoria de UN proceso Node. En un despliegue
 * multi-instancia (varios procesos/contenedores detrás de un balanceador)
 * cada instancia lleva su propio conteo — un atacante que reparta sus
 * intentos entre instancias distintas puede efectivamente multiplicar el
 * límite por el número de instancias. La demo actual corre una sola
 * instancia (VPS Hostinger, Docker manual), así que esto es aceptable hoy;
 * si el despliegue pasa a multi-instancia, este estado debe moverse a algo
 * compartido (tabla en la base de datos, o Redis) — la interfaz de este
 * módulo (`checkLoginRateLimit`/`recordLoginFailure`/`recordLoginSuccess`) ya
 * está pensada para que ese cambio no toque `login()`.
 */

type AttemptState = {
  failures: number;
  lockedUntil: number;
  updatedAt: number;
};

const FREE_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000; // 30s
const MAX_LOCKOUT_MS = 15 * 60_000; // 15 min
const STALE_ENTRY_MS = 60 * 60_000; // 1h sin actividad = se puede olvidar
const CLEANUP_SAMPLE_RATE = 0.02; // ~2% de las llamadas dispara una limpieza

const attempts = new Map<string, AttemptState>();

function cleanupStaleEntries(now: number): void {
  for (const [key, state] of attempts) {
    if (state.lockedUntil < now && now - state.updatedAt > STALE_ENTRY_MS) {
      attempts.delete(key);
    }
  }
}

function maybeCleanup(now: number): void {
  if (Math.random() < CLEANUP_SAMPLE_RATE) cleanupStaleEntries(now);
}

export type LoginRateLimitKeys = {
  /** Email normalizado (lowercase, trim) — protege UNA cuenta puntual. */
  email: string;
  /** IP del cliente, si se pudo determinar — protege contra rociar muchos emails desde un mismo origen. */
  ip: string | null;
};

function keysFor({ email, ip }: LoginRateLimitKeys): string[] {
  const keys = [`email:${email}`];
  if (ip) keys.push(`ip:${ip}`);
  return keys;
}

export type RateLimitCheck = { limited: false } | { limited: true; retryAfterMs: number };

/** ¿Alguna de las claves (email o IP) está actualmente bloqueada? */
export function checkLoginRateLimit(target: LoginRateLimitKeys): RateLimitCheck {
  const now = Date.now();
  maybeCleanup(now);

  let retryAfterMs = 0;
  for (const key of keysFor(target)) {
    const state = attempts.get(key);
    if (state && state.lockedUntil > now) {
      retryAfterMs = Math.max(retryAfterMs, state.lockedUntil - now);
    }
  }

  return retryAfterMs > 0 ? { limited: true, retryAfterMs } : { limited: false };
}

/** Registra un intento fallido (email/password inválidos o usuario inactivo). */
export function recordLoginFailure(target: LoginRateLimitKeys): void {
  const now = Date.now();
  for (const key of keysFor(target)) {
    const state = attempts.get(key) ?? { failures: 0, lockedUntil: 0, updatedAt: now };
    state.failures += 1;
    state.updatedAt = now;

    if (state.failures > FREE_ATTEMPTS) {
      const exponent = state.failures - FREE_ATTEMPTS - 1;
      const delay = Math.min(MAX_LOCKOUT_MS, BASE_LOCKOUT_MS * 2 ** exponent);
      state.lockedUntil = now + delay;
    }

    attempts.set(key, state);
  }
}

/** Limpia el contador de fallas de ambas claves tras un login exitoso. */
export function recordLoginSuccess(target: LoginRateLimitKeys): void {
  for (const key of keysFor(target)) attempts.delete(key);
}

/** Solo para tests: vacía todo el estado en memoria. */
export function __resetLoginRateLimitForTests(): void {
  attempts.clear();
}

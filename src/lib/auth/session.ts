import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Sesión real de usuario (reemplaza el gate de `DEMO_PASSWORD`). Firmada con
 * `jose` (no Node `crypto` nativo) a propósito: `src/proxy.ts` corre en
 * runtime Edge por defecto y necesita poder verificar la cookie sin
 * dependencias nativas — ver decision_multitenant_organization_user en
 * memoria.
 *
 * El payload solo lleva los dos ids necesarios para autorizar (`sub` =
 * userId, `organizationId`) — nunca password ni datos sensibles.
 */

export const SESSION_COOKIE_NAME = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 días

export type SessionPayload = {
  userId: string;
  organizationId: string;
};

function getSessionSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "Falta la variable de entorno SESSION_SECRET (requerida para firmar/verificar la sesión de usuario)."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ organizationId: payload.organizationId } satisfies Omit<JWTPayload, "sub"> & {
    organizationId: string;
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSessionSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecretKey());
    const userId = payload.sub;
    const organizationId = payload.organizationId;
    if (typeof userId !== "string" || typeof organizationId !== "string") return null;
    return { userId, organizationId };
  } catch {
    // Firma inválida, token expirado, o payload malformado — todos los casos
    // se tratan igual: sesión inválida, nunca se distingue el motivo al
    // cliente (evita dar pistas útiles a un atacante).
    return null;
  }
}

/** Server-only: lee y verifica la cookie de sesión. No redirige. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Igual que `getSession()`, pero lanza/redirige si no hay sesión válida.
 * Úsalo al inicio de cada Server Action y Route Handler que toque datos de
 * negocio — nunca confíes solo en que `src/proxy.ts` ya filtró la request,
 * cada punto de entrada debe exigir y usar su propio `organizationId`.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

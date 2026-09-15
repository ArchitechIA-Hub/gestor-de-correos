import { SignJWT, jwtVerify } from "jose";

/**
 * `state` firmado del flujo OAuth de Gmail (Fase 5 de
 * decision_multitenant_organization_user en memoria): sin esto, cualquiera
 * podía completar SU PROPIO consentimiento de Google, mandarle la URL de
 * callback (con su `code`) a otra persona logueada en la app, y hacer que la
 * cuenta de Gmail del atacante quedara conectada a la organización de la
 * víctima (CSRF clásico de OAuth) — el chequeo de "cuenta ya conectada a otra
 * organización" que ya existía no cubre este caso porque la cuenta del
 * atacante nunca estuvo conectada a nadie.
 *
 * Comparte `SESSION_SECRET` con las sesiones de usuario (jose, Edge-safe) por
 * simplicidad de config, pero lleva `purpose` para que un JWT de sesión no
 * pueda reutilizarse como `state` ni viceversa.
 */

const OAUTH_STATE_TTL_SECONDS = 10 * 60; // vida sobrada para completar el consentimiento en Google

type GmailOAuthStatePayload = { organizationId: string; userId: string };

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Falta SESSION_SECRET (firma tanto la sesión como el state de OAuth de Gmail).");
  }
  return new TextEncoder().encode(secret);
}

export async function createGmailOAuthState(payload: GmailOAuthStatePayload): Promise<string> {
  return new SignJWT({ purpose: "gmail_oauth", ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_STATE_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyGmailOAuthState(token: string): Promise<GmailOAuthStatePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.purpose !== "gmail_oauth") return null;
    const { organizationId, userId } = payload;
    if (typeof organizationId !== "string" || typeof userId !== "string") return null;
    return { organizationId, userId };
  } catch {
    // Firma inválida, expirado, o malformado — todos los casos se tratan
    // igual: state inválido, sin distinguir el motivo (mismo criterio que
    // verifySessionToken en src/lib/auth/session.ts).
    return null;
  }
}

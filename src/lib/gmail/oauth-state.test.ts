import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { createGmailOAuthState, verifyGmailOAuthState } from "./oauth-state";
import { createSessionToken } from "@/lib/auth/session";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-para-oauth-state";
});

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET!);
}

describe("gmail oauth state (Fase 5 — protección CSRF)", () => {
  it("round-trip: lo que se firma es lo que se verifica", async () => {
    const token = await createGmailOAuthState({ organizationId: "org-1", userId: "user-1" });
    const payload = await verifyGmailOAuthState(token);
    expect(payload).toEqual({ organizationId: "org-1", userId: "user-1" });
  });

  it("rechaza un token con firma inválida (secreto distinto)", async () => {
    const token = await createGmailOAuthState({ organizationId: "org-1", userId: "user-1" });
    process.env.SESSION_SECRET = "otro-secreto-completamente-distinto";
    expect(await verifyGmailOAuthState(token)).toBeNull();
  });

  it("rechaza un token expirado", async () => {
    const expired = await new SignJWT({ purpose: "gmail_oauth", organizationId: "org-1", userId: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60) // expiró hace 1 minuto
      .sign(secretKey());

    expect(await verifyGmailOAuthState(expired)).toBeNull();
  });

  it("rechaza un JWT válido pero de OTRO propósito (p. ej. una cookie de sesión real)", async () => {
    // Mismo secreto, mismo algoritmo — la única diferencia es que este JWT es
    // una sesión de usuario real, no un state de OAuth. Si alguna vez se
    // aceptara sin mirar `purpose`, un token de sesión filtrado serviría para
    // falsificar un `state`.
    const sessionToken = await createSessionToken({ userId: "user-1", organizationId: "org-1" });
    expect(await verifyGmailOAuthState(sessionToken)).toBeNull();
  });

  it("rechaza basura / un token malformado", async () => {
    expect(await verifyGmailOAuthState("no-soy-un-jwt")).toBeNull();
  });
});

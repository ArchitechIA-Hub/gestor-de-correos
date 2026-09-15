import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/gmail/client", () => ({
  exchangeCodeForTokens: vi.fn(),
  getAuthenticatedGmailProfile: vi.fn(),
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { exchangeCodeForTokens, getAuthenticatedGmailProfile } from "@/lib/gmail/client";
import { createGmailOAuthState } from "@/lib/gmail/oauth-state";
import { GET } from "./route";

const mockedRequireSession = vi.mocked(requireSession);
const mockedExchangeCodeForTokens = vi.mocked(exchangeCodeForTokens);
const mockedGetAuthenticatedGmailProfile = vi.mocked(getAuthenticatedGmailProfile);

let organizationId: string;
let otherOrganizationId: string;

async function resetDb() {
  // Orden FK-safe completo (no solo lo que este archivo siembra): test.db se
  // comparte entre archivos de test dentro de la misma corrida sin limpiarse
  // entre ellos, así que `organization.deleteMany()` puede chocar con filas
  // que dejó OTRO archivo si no se borra todo lo que cuelga de Organization.
  await prisma.whatsAppNotification.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.urgentAlert.deleteMany();
  await prisma.auditLogEntry.deleteMany();
  await prisma.draft.deleteMany();
  await prisma.commitment.deleteMany();
  await prisma.emailAttachment.deleteMany();
  await prisma.email.deleteMany();
  await prisma.sender.deleteMany();
  await prisma.mailAccount.deleteMany();
  await prisma.scanCycleLog.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.extraConfig.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

function callbackRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/google/callback");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function redirectPath(response: Response): string {
  const location = response.headers.get("location")!;
  return new URL(location).pathname + new URL(location).search;
}

beforeEach(async () => {
  process.env.SESSION_SECRET = "test-secret-para-oauth-state";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/google/callback";
  // El callback cifra el refresh_token de verdad (no está mockeado) antes de
  // guardarlo — ver src/lib/crypto/encryption.ts.
  process.env.ENCRYPTION_KEY = Buffer.from("f".repeat(32)).toString("base64");
  await resetDb();
  const organization = await prisma.organization.create({ data: { name: "Org de prueba" } });
  const other = await prisma.organization.create({ data: { name: "Otra org" } });
  organizationId = organization.id;
  otherOrganizationId = other.id;
  mockedRequireSession.mockResolvedValue({ userId: "user-1", organizationId });
  mockedExchangeCodeForTokens.mockReset();
  mockedGetAuthenticatedGmailProfile.mockReset();
});

/**
 * Verificación de la Fase 5 (endurecimiento OAuth, ver
 * decision_multitenant_organization_user en memoria): el callback debe
 * rechazar cualquier intento de completarlo sin un `state` firmado por ESTA
 * MISMA sesión — de lo contrario alguien podría completar su propio
 * consentimiento de Google y mandarle esta URL (con su `code`) a otra
 * persona logueada en la app.
 */
describe("GET /api/auth/google/callback", () => {
  it("rechaza el callback si falta el state, sin llamar a Google", async () => {
    const response = await GET(callbackRequest({ code: "un-code-cualquiera" }));

    expect(redirectPath(response)).toBe("/settings/accounts?gmail_error=state_invalido");
    expect(mockedExchangeCodeForTokens).not.toHaveBeenCalled();
    expect(await prisma.mailAccount.count()).toBe(0);
  });

  it("rechaza el callback si el state es de OTRA organización, sin llamar a Google", async () => {
    const foreignState = await createGmailOAuthState({ organizationId: otherOrganizationId, userId: "user-2" });

    const response = await GET(callbackRequest({ code: "un-code-cualquiera", state: foreignState }));

    expect(redirectPath(response)).toBe("/settings/accounts?gmail_error=state_invalido");
    expect(mockedExchangeCodeForTokens).not.toHaveBeenCalled();
    expect(await prisma.mailAccount.count()).toBe(0);
  });

  it("rechaza el callback si el state es basura, sin llamar a Google", async () => {
    const response = await GET(callbackRequest({ code: "un-code-cualquiera", state: "no-soy-un-jwt" }));

    expect(redirectPath(response)).toBe("/settings/accounts?gmail_error=state_invalido");
    expect(mockedExchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("completa el flujo cuando el state es válido para la organización de la sesión", async () => {
    const validState = await createGmailOAuthState({ organizationId, userId: "user-1" });
    mockedExchangeCodeForTokens.mockResolvedValue({ refresh_token: "rt-123" });
    mockedGetAuthenticatedGmailProfile.mockResolvedValue({ emailAddress: "conectada@gmail.com" });

    const response = await GET(callbackRequest({ code: "un-code-valido", state: validState }));

    expect(redirectPath(response)).toBe("/settings/accounts?gmail_connected=1");
    const account = await prisma.mailAccount.findUniqueOrThrow({ where: { emailAddress: "conectada@gmail.com" } });
    expect(account.organizationId).toBe(organizationId);
    expect(account.provider).toBe("gmail");
  });
});

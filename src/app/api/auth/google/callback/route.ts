import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/record";
import { exchangeCodeForTokens, getAuthenticatedGmailProfile } from "@/lib/gmail/client";
import { verifyGmailOAuthState } from "@/lib/gmail/oauth-state";
import { describeGoogleApiError } from "@/lib/gmail/errors";
import { encrypt } from "@/lib/crypto/encryption";

/**
 * Callback del consentimiento OAuth de Google. Intercambia el `code` por
 * tokens, identifica la cuenta real de Gmail y la registra/actualiza como
 * MailAccount con provider "gmail", asociada a la organización de la sesión
 * actual. `MailAccount.emailAddress` es único GLOBAL a propósito (ver
 * decision_multitenant_organization_user en memoria) — si la cuenta ya está
 * conectada a OTRA organización se rechaza en vez de reasignarla en
 * silencio.
 *
 * El `state` (Fase 5 de ese mismo plan) se valida ANTES que cualquier otra
 * cosa, incluso antes de mirar `code`/`error`: sin esto, alguien podía
 * completar SU PROPIO consentimiento de Google y mandarle esta URL de
 * callback (con su `code`) a otra persona logueada en la app — sin `state`
 * atado a la sesión que inició el flujo, no hay forma de distinguir eso de
 * un callback legítimo.
 */
export async function GET(request: NextRequest) {
  // No usar `request.url` como base para redirects absolutos: detrás de un
  // reverse proxy (Caddy en la demo de Hostinger) Next.js puede resolverlo
  // mal (visto en producción: devolvía "localhost:3000" en vez del dominio
  // público). GOOGLE_REDIRECT_URI ya trae el origen público correcto para
  // este mismo entorno (local o demo), así que se reutiliza como base.
  const appOrigin = new URL(process.env.GOOGLE_REDIRECT_URI!).origin;
  const { organizationId } = await requireSession();

  const stateParam = request.nextUrl.searchParams.get("state");
  const state = stateParam ? await verifyGmailOAuthState(stateParam) : null;
  if (!state || state.organizationId !== organizationId) {
    return NextResponse.redirect(new URL("/settings/accounts?gmail_error=state_invalido", appOrigin));
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/settings/accounts?gmail_error=${encodeURIComponent(error ?? "sin_code")}`, appOrigin)
    );
  }

  let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
  let emailAddress: string | null | undefined;
  try {
    tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL("/settings/accounts?gmail_error=sin_refresh_token", appOrigin));
    }

    const profile = await getAuthenticatedGmailProfile(tokens);
    emailAddress = profile.emailAddress;
  } catch (error) {
    // No dejar propagar el error de gaxios/googleapis tal cual: trae el
    // cuerpo crudo de la request (código de autorización, credenciales del
    // cliente) — ver src/lib/gmail/errors.ts.
    console.error("[oauth] fallo al intercambiar el code por tokens:", describeGoogleApiError(error));
    return NextResponse.redirect(new URL("/settings/accounts?gmail_error=fallo_oauth", appOrigin));
  }
  if (!emailAddress) {
    return NextResponse.redirect(new URL("/settings/accounts?gmail_error=sin_perfil", appOrigin));
  }

  const existing = await prisma.mailAccount.findUnique({ where: { emailAddress } });
  if (existing && existing.organizationId !== organizationId) {
    return NextResponse.redirect(new URL("/settings/accounts?gmail_error=cuenta_ya_conectada", appOrigin));
  }

  // Cifrado en reposo (AES-256-GCM) — ver src/lib/crypto/encryption.ts. El
  // único lugar que necesita el valor real es getGmailClientForAccount, que
  // lo descifra ahí mismo. Si falta ENCRYPTION_KEY en este entorno, mejor
  // fallar el flujo con un error legible que guardar el refresh token sin
  // cifrar o tumbar la request con un 500 crudo.
  let encryptedRefreshToken: string;
  try {
    encryptedRefreshToken = encrypt(tokens.refresh_token);
  } catch (error) {
    console.error("[oauth] fallo al cifrar el refresh token:", error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL("/settings/accounts?gmail_error=config_cifrado", appOrigin));
  }

  const account = await prisma.mailAccount.upsert({
    where: { emailAddress },
    create: {
      organizationId,
      emailAddress,
      label: emailAddress,
      provider: "gmail",
      isActive: true,
      googleRefreshToken: encryptedRefreshToken,
    },
    update: {
      provider: "gmail",
      isActive: true,
      googleRefreshToken: encryptedRefreshToken,
    },
  });

  await recordAuditEvent({
    organizationId,
    actionType: "MANAGE_MAIL_ACCOUNT",
    entityType: "MailAccount",
    entityId: account.id,
    payloadBefore: existing ? { provider: existing.provider, isActive: existing.isActive } : undefined,
    payloadAfter: { provider: "gmail", emailAddress, isActive: true },
    performedBy: "USER",
  });

  return NextResponse.redirect(new URL("/settings/accounts?gmail_connected=1", appOrigin));
}

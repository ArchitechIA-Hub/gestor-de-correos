import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";
import { exchangeCodeForTokens, getAuthenticatedGmailProfile } from "@/lib/gmail/client";
import { describeGoogleApiError } from "@/lib/gmail/errors";

/**
 * Callback del consentimiento OAuth de Google. Intercambia el `code` por
 * tokens, identifica la cuenta real de Gmail y la registra/actualiza como
 * MailAccount con provider "gmail" — sin crear ninguna sesión de usuario
 * nueva, ya que el prototipo no tiene noción de usuarios (ver CURRENT_USER_NAME).
 */
export async function GET(request: NextRequest) {
  // No usar `request.url` como base para redirects absolutos: detrás de un
  // reverse proxy (Caddy en la demo de Hostinger) Next.js puede resolverlo
  // mal (visto en producción: devolvía "localhost:3000" en vez del dominio
  // público). GOOGLE_REDIRECT_URI ya trae el origen público correcto para
  // este mismo entorno (local o demo), así que se reutiliza como base.
  const appOrigin = new URL(process.env.GOOGLE_REDIRECT_URI!).origin;

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

  const account = await prisma.mailAccount.upsert({
    where: { emailAddress },
    create: {
      emailAddress,
      label: emailAddress,
      provider: "gmail",
      isActive: true,
      googleRefreshToken: tokens.refresh_token,
    },
    update: {
      provider: "gmail",
      isActive: true,
      googleRefreshToken: tokens.refresh_token,
    },
  });

  await recordAuditEvent({
    actionType: "MANAGE_MAIL_ACCOUNT",
    entityType: "MailAccount",
    entityId: account.id,
    payloadBefore: existing ? { provider: existing.provider, isActive: existing.isActive } : undefined,
    payloadAfter: { provider: "gmail", emailAddress, isActive: true },
    performedBy: "USER",
  });

  return NextResponse.redirect(new URL("/settings/accounts?gmail_connected=1", appOrigin));
}

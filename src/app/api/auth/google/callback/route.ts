import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/record";
import { exchangeCodeForTokens, getAuthenticatedGmailProfile } from "@/lib/gmail/client";

/**
 * Callback del consentimiento OAuth de Google. Intercambia el `code` por
 * tokens, identifica la cuenta real de Gmail y la registra/actualiza como
 * MailAccount con provider "gmail" — sin crear ninguna sesión de usuario
 * nueva, ya que el prototipo no tiene noción de usuarios (ver CURRENT_USER_NAME).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/settings/accounts?gmail_error=${encodeURIComponent(error ?? "sin_code")}`, request.url)
    );
  }

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.refresh_token) {
    return NextResponse.redirect(new URL("/settings/accounts?gmail_error=sin_refresh_token", request.url));
  }

  const profile = await getAuthenticatedGmailProfile(tokens);
  const emailAddress = profile.emailAddress;
  if (!emailAddress) {
    return NextResponse.redirect(new URL("/settings/accounts?gmail_error=sin_perfil", request.url));
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

  return NextResponse.redirect(new URL("/settings/accounts?gmail_connected=1", request.url));
}

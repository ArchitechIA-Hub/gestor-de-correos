import { google } from "googleapis";
import type { MailAccountModel } from "@/generated/prisma/models";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * URL de consentimiento de Google. `prompt: "consent"` fuerza que Google
 * reemita un refresh_token también en reconexiones (por defecto solo lo
 * entrega la primera vez que el usuario autoriza la app).
 */
export function getAuthUrl(): string {
  return getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_READONLY_SCOPE, GMAIL_SEND_SCOPE],
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Cliente Gmail autenticado para una cuenta ya conectada. Usa el refresh
 * token guardado para obtener access tokens nuevos automáticamente
 * (googleapis lo maneja internamente en cada llamada).
 */
export function getGmailClientForAccount(mailAccount: Pick<MailAccountModel, "googleRefreshToken">) {
  if (!mailAccount.googleRefreshToken) {
    throw new Error("Esta cuenta no tiene un refresh token de Google guardado.");
  }
  const auth = getOAuthClient();
  auth.setCredentials({ refresh_token: mailAccount.googleRefreshToken });
  return google.gmail({ version: "v1", auth });
}

export async function getAuthenticatedGmailProfile(tokens: { refresh_token?: string | null; access_token?: string | null }) {
  const auth = getOAuthClient();
  auth.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth });
  const profile = await gmail.users.getProfile({ userId: "me" });
  return profile.data;
}

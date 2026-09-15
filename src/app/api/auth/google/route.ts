import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getAuthUrl } from "@/lib/gmail/client";
import { createGmailOAuthState } from "@/lib/gmail/oauth-state";

export async function GET() {
  const { organizationId, userId } = await requireSession();
  const state = await createGmailOAuthState({ organizationId, userId });
  return NextResponse.redirect(getAuthUrl(state));
}

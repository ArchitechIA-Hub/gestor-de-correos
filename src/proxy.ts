import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Reemplaza el gate de `DEMO_PASSWORD` (contraseña única compartida, cookie
 * en texto plano) por sesión real por persona: JWT firmado (`jose`, corre en
 * Edge) verificado en cada request. Ver decision_multitenant_organization_user
 * en memoria.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (session) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // `/api/scan` y `/api/send-digest` siguen protegidos por su propio secreto
  // (INTERNAL_SCAN_SECRET) — son llamadas servidor-a-servidor del scheduler,
  // no de un navegador con sesión de usuario.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/scan|api/send-digest).*)"],
};

import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "demo_auth";

export function proxy(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return NextResponse.next();

  const cookie = request.cookies.get(COOKIE_NAME);
  if (cookie?.value === password) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/scan).*)"],
};

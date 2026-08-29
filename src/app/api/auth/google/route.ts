import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail/client";

export async function GET() {
  return NextResponse.redirect(getAuthUrl());
}

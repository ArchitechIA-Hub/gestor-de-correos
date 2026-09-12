import { NextResponse } from "next/server";
import { sendDigest } from "@/app/actions/send-digest";

/**
 * Wrapper HTTP de sendDigest() para el scheduler automático
 * (src/lib/scheduler/auto-digest.ts) — mismo motivo que /api/scan: el
 * scheduler corre en instrumentation.ts, fuera del ciclo de vida de una
 * request de Next, y sendDigest() usa revalidatePath.
 */
export async function POST(request: Request) {
  const expectedSecret = process.env.INTERNAL_SCAN_SECRET;
  if (expectedSecret && request.headers.get("x-scan-secret") !== expectedSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await sendDigest({ range: "weekly" }, "SYSTEM");
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { scan } from "@/app/actions/scan";

/**
 * Wrapper HTTP de scan() para el scheduler automático (src/lib/scheduler/auto-scan.ts).
 * El scheduler corre en instrumentation.ts, fuera del ciclo de vida de una
 * request de Next — llamar a scan() ahí directamente rompe revalidatePath
 * (necesita el contexto de una Route Handler/Server Action real). Pasar por
 * este endpoint le da ese contexto.
 */
export async function POST(request: Request) {
  const expectedSecret = process.env.INTERNAL_SCAN_SECRET;
  if (expectedSecret && request.headers.get("x-scan-secret") !== expectedSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const result = await scan();
  return NextResponse.json(result);
}

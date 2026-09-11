import { NextResponse } from "next/server";
import { scan } from "@/app/actions/scan";
import { importNewGmailEmails } from "@/app/actions/import-gmail";
import { prisma } from "@/lib/db/prisma";
import { getCurrentServiceLevel } from "@/lib/priority/current";

/**
 * Wrapper HTTP de un ciclo completo del scheduler automático
 * (src/lib/scheduler/auto-scan.ts): importa correo nuevo de Gmail (catch-up
 * con parada temprana, sin costo de IA) y clasifica el backlog resultante con
 * scan(). El scheduler corre en instrumentation.ts, fuera del ciclo de vida
 * de una request de Next — llamar a estas funciones ahí directamente rompe
 * revalidatePath (necesita el contexto de una Route Handler/Server Action
 * real). Pasar por este endpoint le da ese contexto.
 */
export async function POST(request: Request) {
  const expectedSecret = process.env.INTERNAL_SCAN_SECRET;
  if (expectedSecret && request.headers.get("x-scan-secret") !== expectedSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const gmailAccounts = await prisma.mailAccount.findMany({
    where: { provider: "gmail", isActive: true, googleRefreshToken: { not: null } },
    select: { id: true, emailAddress: true },
  });

  let imported = 0;
  for (const account of gmailAccounts) {
    try {
      const result = await importNewGmailEmails(account.id);
      imported += result.imported;
    } catch (error) {
      // Un fallo puntual de Gmail (token revocado, rate limit) no debe
      // tumbar el ciclo de clasificación del resto del backlog ya importado.
      console.error(`[import] catch-up falló para ${account.emailAddress}:`, error);
    }
  }

  const scanResult = await scan();
  const { level, backlogCount } = await getCurrentServiceLevel();

  await prisma.scanCycleLog.create({
    data: {
      emailsImported: imported,
      emailsScanned: scanResult.scanned,
      inputTokens: scanResult.inputTokens,
      outputTokens: scanResult.outputTokens,
      totalTokens: scanResult.totalTokens,
      serviceLevel: level,
      backlogCount,
    },
  });

  return NextResponse.json({ imported, ...scanResult, serviceLevel: level, backlogCount });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getUserTimeZone } from "@/lib/settings";
import { sendDigestForOrganization } from "@/lib/digest/send-digest-for-org";
import { getNextWeeklyOccurrence } from "@/lib/scheduler/next-occurrence";

// Jueves 7am, hora de cada organización — mismos valores que
// src/lib/scheduler/auto-digest.ts (mantenerlos sincronizados si cambian).
const DIGEST_WEEKDAY = 4;
const DIGEST_HOUR = 7;

/**
 * Wrapper HTTP del envío automático semanal del Informe para el scheduler
 * (src/lib/scheduler/auto-digest.ts) — itera TODAS las organizaciones
 * activas, cada una con su propia zona horaria y su propio "¿ya le tocó esta
 * semana?" (derivado del AuditLogEntry SEND_DIGEST más reciente, sin columna
 * nueva). El envío manual desde la UI no pasa por aquí — ver
 * src/app/actions/send-digest.ts.
 */
export async function POST(request: Request) {
  const expectedSecret = process.env.INTERNAL_SCAN_SECRET;
  if (expectedSecret && request.headers.get("x-scan-secret") !== expectedSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const organizations = await prisma.organization.findMany({ where: { isActive: true }, select: { id: true } });
  const now = new Date();

  const results = [];
  for (const { id: organizationId } of organizations) {
    try {
      const timeZone = await getUserTimeZone(organizationId);
      const lastSent = await prisma.auditLogEntry.findFirst({
        where: { organizationId, actionType: "SEND_DIGEST" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

      // "¿Ya pasó la próxima ocurrencia semanal desde el último envío?" — si
      // nunca se envió, la primera ocurrencia futura desde epoch siempre ya
      // pasó respecto a `now`, así que se envía en el primer tick posible.
      const nextOccurrenceSinceLastSent = getNextWeeklyOccurrence(lastSent?.createdAt ?? new Date(0), timeZone, {
        weekday: DIGEST_WEEKDAY,
        hour: DIGEST_HOUR,
      });
      if (now < nextOccurrenceSinceLastSent) continue;

      const result = await sendDigestForOrganization(organizationId, "weekly", "SYSTEM");
      results.push({ organizationId, ...result });
    } catch (error) {
      // Un fallo puntual (sin cuenta Gmail conectada, sin destinatario
      // configurado, error de Gmail) no debe tumbar el envío de las demás
      // organizaciones.
      const message = error instanceof Error ? error.message : "Error desconocido";
      console.error(`[send-digest] falló para la organización ${organizationId}:`, message);
      results.push({ organizationId, error: message });
    }
  }

  return NextResponse.json({ organizations: results });
}

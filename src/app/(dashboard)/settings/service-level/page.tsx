import {
  SERVICE_LEVEL_DEFINITIONS,
  URGENT_THRESHOLD_HOURS,
  FEATURES_UNLOCKED_FOR_ALL_LEVELS,
} from "@/lib/priority/constants";
import { requireSession } from "@/lib/auth/session";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { Badge } from "@/components/ui/badge";
import { DevBacklogControls } from "@/components/settings/dev-backlog-controls";
import { prisma } from "@/lib/db/prisma";
import { formatShortDateTime } from "@/lib/format/date";
import { getUserTimeZone } from "@/lib/settings";
import { SCAN_BATCH_SIZE } from "@/lib/scan/constants";

export const dynamic = "force-dynamic";

const RECENT_CYCLES_LIMIT = 10;

export default async function ServiceLevelPage() {
  const { organizationId } = await requireSession();
  const current = await getCurrentServiceLevel(organizationId);
  const timeZone = await getUserTimeZone(organizationId);
  const recentCycles = await prisma.scanCycleLog.findMany({
    where: { organizationId },
    orderBy: { startedAt: "desc" },
    take: RECENT_CYCLES_LIMIT,
  });
  const tokensToday = await prisma.scanCycleLog.aggregate({
    where: { organizationId, startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    _sum: { totalTokens: true },
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Nivel de servicio</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          El nivel no es una elección — se recalcula automáticamente según el backlog de correos sin
          clasificar ({current.backlogCount} en este momento). Un compromiso con vencimiento en menos de{" "}
          {URGENT_THRESHOLD_HOURS}h siempre dispara urgencia inmediata, sin importar el nivel activo.
        </p>
        {FEATURES_UNLOCKED_FOR_ALL_LEVELS && (
          <p className="mt-2 max-w-2xl text-sm text-vip">
            Nota: mientras se valida el producto, borradores, alertas push y la vista de prioridades están activos en
            todos los niveles (decisión temporal — el escalonamiento por nivel puede reactivarse más adelante).
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICE_LEVEL_DEFINITIONS.map((def) => {
          const isActive = def.level === current.level;
          return (
            <div
              key={def.level}
              className={`rounded-lg border p-4 ${isActive ? "border-foreground bg-card" : "border-border"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-heading text-lg text-foreground">Nivel {def.level}</span>
                {isActive && <Badge>Activo</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{def.name}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {def.backlogMax === Infinity ? `Más de ${def.backlogMin - 1}` : `${def.backlogMin}–${def.backlogMax}`} sin clasificar
              </p>
              <p className="text-xs text-muted-foreground">Escaneo cada {def.scanFrequencyMinutes} min</p>
              <ul className="mt-3 flex flex-col gap-1 text-xs">
                <li className={def.features.draftGeneration ? "text-foreground" : "text-muted-foreground/50"}>
                  Borradores de respuesta
                </li>
                <li className={def.features.urgentPushAlerts ? "text-foreground" : "text-muted-foreground/50"}>
                  Alertas push de urgencia
                </li>
                <li className={def.features.rescueMode ? "text-foreground" : "text-muted-foreground/50"}>
                  Prioridades (10 compromisos más urgentes)
                </li>
              </ul>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Actividad del escaneo automático</p>
          <span className="text-xs text-muted-foreground">
            Hoy: {(tokensToday._sum.totalTokens ?? 0).toLocaleString("es")} tokens
          </span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Cada ciclo importa correo nuevo de Gmail (sin costo de IA) y clasifica el backlog resultante
          (máx. {SCAN_BATCH_SIZE} correos por ciclo). Últimos {RECENT_CYCLES_LIMIT} ciclos:
        </p>
        {recentCycles.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no corrió ningún ciclo automático.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pr-4 pb-1 font-normal">Fecha</th>
                  <th className="pr-4 pb-1 font-normal">Nivel</th>
                  <th className="pr-4 pb-1 font-normal">Importados</th>
                  <th className="pr-4 pb-1 font-normal">Escaneados</th>
                  <th className="pr-4 pb-1 font-normal">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {recentCycles.map((cycle) => (
                  <tr key={cycle.id} className="border-t border-border/50 text-foreground">
                    <td className="py-1 pr-4">{formatShortDateTime(cycle.startedAt, timeZone)}</td>
                    <td className="py-1 pr-4">{cycle.serviceLevel}</td>
                    <td className="py-1 pr-4">{cycle.emailsImported}</td>
                    <td className="py-1 pr-4">{cycle.emailsScanned}</td>
                    <td className="py-1 pr-4">{cycle.totalTokens.toLocaleString("es")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {process.env.NODE_ENV !== "production" && (
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="mb-2 text-sm font-medium text-foreground">Panel de desarrollo</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Agrega correos sintéticos sin clasificar para cruzar los umbrales de nivel durante una demo. El
            nivel sigue siendo 100% auto-calculado — esto solo cambia el backlog real.
          </p>
          <DevBacklogControls />
        </div>
      )}
    </div>
  );
}

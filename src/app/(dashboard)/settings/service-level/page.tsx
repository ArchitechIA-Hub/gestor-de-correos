import {
  SERVICE_LEVEL_DEFINITIONS,
  URGENT_THRESHOLD_HOURS,
  FEATURES_UNLOCKED_FOR_ALL_LEVELS,
} from "@/lib/priority/constants";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { Badge } from "@/components/ui/badge";
import { DevBacklogControls } from "@/components/settings/dev-backlog-controls";

export const dynamic = "force-dynamic";

export default async function ServiceLevelPage() {
  const current = await getCurrentServiceLevel();

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

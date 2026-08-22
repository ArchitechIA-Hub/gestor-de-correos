import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { getExtraConfig, countActiveExtras, shouldConsolidatePanel } from "@/lib/extras";
import { getAnalyticsSnapshot } from "@/lib/analytics/metrics";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function PanelPage() {
  const config = await getExtraConfig();
  const activeCount = countActiveExtras(config);
  const consolidated = shouldConsolidatePanel(config);

  if (!consolidated) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl text-foreground">Panel unificado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Este panel se activa automáticamente cuando tienes 3 o más extras activados (actualmente {activeCount}).
          Mientras tanto, cada extra notifica por su propio canal.
        </p>
        <Link href="/settings/extras" className="w-fit text-sm text-primary underline-offset-4 hover:underline">
          Ir a configurar extras
        </Link>
      </div>
    );
  }

  const [urgentEmails, vipUnanswered, analytics] = await Promise.all([
    prisma.email.findMany({
      where: { isUrgent: true, status: "CLASSIFIED" },
      include: { sender: true, commitments: { orderBy: { dueAt: "asc" }, take: 1 } },
      orderBy: { priorityScore: "desc" },
      take: 10,
    }),
    prisma.sender.findMany({
      where: { isVip: true, emails: { some: { drafts: { none: { status: "APPROVED" } } } } },
      take: 10,
    }),
    config.analyticsEnabled ? getAnalyticsSnapshot() : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Panel unificado</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeCount} extras activados — todo consolidado aquí en vez de notificaciones separadas por canal.
        </p>
      </div>

      <section>
        <h2 className="font-heading text-lg text-foreground">Urgentes ({"<"}48h)</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {urgentEmails.map((email) => (
            <li key={email.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{email.sender.name}</span>
                  {email.sender.isVip && <Badge className="bg-vip text-vip-foreground">VIP</Badge>}
                  <Badge className="bg-urgent text-urgent-foreground">Urgente</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{email.subject}</p>
              </div>
              <Link href={`/inbox/${email.id}`} className="text-sm text-primary underline-offset-4 hover:underline">
                Ver
              </Link>
            </li>
          ))}
          {urgentEmails.length === 0 && <p className="text-sm text-muted-foreground">Sin urgencias activas.</p>}
        </ul>
      </section>

      <section>
        <h2 className="font-heading text-lg text-foreground">VIP sin respuesta (SLA)</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {vipUnanswered.map((sender) => (
            <li key={sender.id} className="rounded-lg border border-border bg-card p-3 text-sm">
              <span className="font-medium text-foreground">{sender.name}</span>
              {sender.organization && <span className="text-muted-foreground"> · {sender.organization}</span>}
            </li>
          ))}
          {vipUnanswered.length === 0 && <p className="text-sm text-muted-foreground">Sin pendientes VIP.</p>}
        </ul>
      </section>

      {config.calendarEnabled && (
        <section>
          <h2 className="font-heading text-lg text-foreground">Calendario</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Integración activada — los eventos creados a partir de compromisos aparecerán consolidados aquí.
          </p>
        </section>
      )}

      {config.whatsappEnabled && (
        <section>
          <h2 className="font-heading text-lg text-foreground">WhatsApp</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Integración activada — las notificaciones de correos críticos aparecerán consolidadas aquí.
          </p>
        </section>
      )}

      {analytics && (
        <section>
          <h2 className="font-heading text-lg text-foreground">Analytics</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Tiempo de respuesta promedio</p>
              <p className="font-heading text-2xl text-foreground">
                {analytics.avgResponseTimeHours !== null ? `${analytics.avgResponseTimeHours.toFixed(1)}h` : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Compromisos cumplidos a tiempo</p>
              <p className="font-heading text-2xl text-foreground">
                {analytics.commitmentsOnTimePercentage !== null
                  ? `${analytics.commitmentsOnTimePercentage.toFixed(0)}%`
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Pendientes por antigüedad</p>
              <ul className="mt-1 text-xs text-foreground">
                {analytics.pendingByAgeBucket.map((b) => (
                  <li key={b.bucket}>
                    {b.bucket}: {b.count}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

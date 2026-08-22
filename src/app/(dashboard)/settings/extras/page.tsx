import Link from "next/link";
import { getExtraConfig, countActiveExtras, shouldConsolidatePanel } from "@/lib/extras";
import { ExtraToggle } from "@/components/settings/extra-toggle";

export const dynamic = "force-dynamic";

const EXTRAS = [
  {
    key: "calendarEnabled" as const,
    label: "Integración con calendario",
    description: "Crea eventos automáticamente a partir de compromisos detectados (Google Calendar / Outlook).",
  },
  {
    key: "whatsappEnabled" as const,
    label: "Integración con WhatsApp",
    description: "Notificaciones push de correos críticos.",
  },
  {
    key: "autoDraftToneEnabled" as const,
    label: "Tono habitual en borradores",
    description: "Los borradores automáticos intentan imitar el tono habitual del usuario.",
  },
  {
    key: "vipSlaEnabled" as const,
    label: "SLA de remitentes VIP",
    description: "Prioridad de respuesta reforzada para remitentes marcados como VIP.",
  },
  {
    key: "analyticsEnabled" as const,
    label: "Panel de analytics",
    description: "Tiempo de respuesta promedio, pendientes por antigüedad, % de compromisos cumplidos a tiempo.",
  },
];

export default async function ExtrasSettingsPage() {
  const config = await getExtraConfig();
  const activeCount = countActiveExtras(config);
  const consolidated = shouldConsolidatePanel(config);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Extras opcionales</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Actívalos cuando los necesites. Con 3 o más extras activos, todo se unifica en un panel único.
        </p>
      </div>

      {consolidated && (
        <div className="rounded-lg border border-vip bg-vip/10 p-4 text-sm text-foreground">
          Tienes {activeCount} extras activados — las notificaciones se consolidan en un{" "}
          <Link href="/panel" className="font-medium underline underline-offset-4">
            panel único
          </Link>{" "}
          en vez de canales separados.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {EXTRAS.map((extra) => (
          <ExtraToggle
            key={extra.key}
            flagKey={extra.key}
            label={extra.label}
            description={extra.description}
            checked={config[extra.key]}
          />
        ))}
      </div>
    </div>
  );
}

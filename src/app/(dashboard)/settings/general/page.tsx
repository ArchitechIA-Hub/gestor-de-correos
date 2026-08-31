import { getAppSettings } from "@/lib/settings";
import { TimeZoneForm } from "@/components/settings/timezone-form";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const settings = await getAppSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Preferencias</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajustes generales de la aplicación.
        </p>
      </div>

      <TimeZoneForm currentTimeZone={settings.timeZone} />
    </div>
  );
}

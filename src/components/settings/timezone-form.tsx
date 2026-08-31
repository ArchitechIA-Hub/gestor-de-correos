"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserTimeZone } from "@/app/actions/timezone-settings";
import { COMMON_TIME_ZONES } from "@/lib/format/timezone";

export function TimeZoneForm({ currentTimeZone }: { currentTimeZone: string }) {
  const [value, setValue] = useState(currentTimeZone);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(next: string) {
    setValue(next);
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        await setUserTimeZone(next);
        setStatus("Guardado.");
        router.refresh();
      } catch {
        setError("No se pudo guardar la zona horaria.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <label htmlFor="timezone" className="text-sm font-medium text-foreground">
        Zona horaria
      </label>
      <p className="text-xs text-muted-foreground">
        Todas las fechas y horas de la app se muestran en esta zona.
      </p>
      <select
        id="timezone"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="h-8 w-full max-w-xs rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {COMMON_TIME_ZONES.map((tz) => (
          <option key={tz.id} value={tz.id}>
            {tz.label}
          </option>
        ))}
      </select>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
      {error && <p className="text-xs text-urgent">{error}</p>}
    </div>
  );
}

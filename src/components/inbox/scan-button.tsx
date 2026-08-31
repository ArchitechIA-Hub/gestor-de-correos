"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scan } from "@/app/actions/scan";
import { SCAN_BATCH_SIZE, MIN_SCAN_BATCH_SIZE } from "@/lib/scan/constants";
import { Button } from "@/components/ui/button";

export function ScanButton({ backlogCount }: { backlogCount: number }) {
  const [count, setCount] = useState<number>(Math.min(backlogCount, SCAN_BATCH_SIZE));
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const outOfRange =
    !Number.isFinite(count) || count < MIN_SCAN_BATCH_SIZE || count > SCAN_BATCH_SIZE;

  function handleScan() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await scan({ limit: count });
        setLastResult(
          `Escaneados ${result.scanned} · ${result.commitmentsDetected} compromisos detectados · ${result.urgentDetected} urgentes · ${result.marketingDetected} marketing ignorados`
        );
        router.refresh();
      } catch {
        setError("No se pudo escanear el backlog. Verifica que OPENAI_API_KEY esté configurada correctamente.");
      }
    });
  }

  if (backlogCount === 0) {
    return <p className="text-sm text-muted-foreground">No hay correos pendientes de escanear.</p>;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={MIN_SCAN_BATCH_SIZE}
          max={SCAN_BATCH_SIZE}
          value={Number.isFinite(count) ? count : ""}
          onChange={(e) => setCount(e.target.valueAsNumber)}
          aria-label="Cantidad de correos a clasificar"
          className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button onClick={handleScan} disabled={isPending || outOfRange} size="sm">
          {isPending ? "Escaneando…" : "Escanear siguiente lote"}
        </Button>
        {lastResult && <span className="text-xs text-muted-foreground">{lastResult}</span>}
      </div>
      {outOfRange && (
        <span className="text-xs text-muted-foreground">
          Entre {MIN_SCAN_BATCH_SIZE} y {SCAN_BATCH_SIZE}
        </span>
      )}
      {error && <span className="text-xs text-urgent">{error}</span>}
    </div>
  );
}

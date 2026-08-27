"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scan } from "@/app/actions/scan";
import { Button } from "@/components/ui/button";

export function ScanButton({ backlogCount }: { backlogCount: number }) {
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleScan() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await scan();
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
        <Button onClick={handleScan} disabled={isPending} size="sm">
          {isPending ? "Escaneando…" : `Escanear siguiente lote (${Math.min(backlogCount, 8)})`}
        </Button>
        {lastResult && <span className="text-xs text-muted-foreground">{lastResult}</span>}
      </div>
      {error && <span className="text-xs text-urgent">{error}</span>}
    </div>
  );
}

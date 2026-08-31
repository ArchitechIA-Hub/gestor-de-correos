"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scan } from "@/app/actions/scan";
import { SCAN_BATCH_SIZE, MIN_SCAN_BATCH_SIZE } from "@/lib/scan/constants";
import { Button } from "@/components/ui/button";

export function ScanAccountButton({ accountId }: { accountId: string }) {
  const [count, setCount] = useState<number>(SCAN_BATCH_SIZE);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const outOfRange =
    !Number.isFinite(count) || count < MIN_SCAN_BATCH_SIZE || count > SCAN_BATCH_SIZE;

  function handleClick() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const { scanned, commitmentsDetected, urgentDetected, marketingDetected } = await scan({
          mailAccountId: accountId,
          limit: count,
        });
        setResult(`${scanned} escaneados · ${commitmentsDetected} compromisos · ${urgentDetected} urgentes · ${marketingDetected} marketing`);
        router.refresh();
      } catch {
        setError("No se pudo escanear. Verifica OPENAI_API_KEY.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={MIN_SCAN_BATCH_SIZE}
          max={SCAN_BATCH_SIZE}
          value={Number.isFinite(count) ? count : ""}
          onChange={(e) => setCount(e.target.valueAsNumber)}
          aria-label="Cantidad de correos a clasificar"
          className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="button" size="sm" variant="outline" onClick={handleClick} disabled={isPending || outOfRange}>
          {isPending ? "Escaneando…" : "Clasificar correos de esta cuenta"}
        </Button>
      </div>
      {outOfRange && (
        <p className="text-xs text-muted-foreground">
          Entre {MIN_SCAN_BATCH_SIZE} y {SCAN_BATCH_SIZE}
        </p>
      )}
      {result && <p className="text-xs text-muted-foreground">{result}</p>}
      {error && <p className="text-xs text-urgent">{error}</p>}
    </div>
  );
}

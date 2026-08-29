"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scan } from "@/app/actions/scan";
import { Button } from "@/components/ui/button";

export function ScanAccountButton({ accountId }: { accountId: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const { scanned, commitmentsDetected, urgentDetected, marketingDetected } = await scan({
          mailAccountId: accountId,
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
      <Button type="button" size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Escaneando…" : "Clasificar correos de esta cuenta"}
      </Button>
      {result && <p className="text-xs text-muted-foreground">{result}</p>}
      {error && <p className="text-xs text-urgent">{error}</p>}
    </div>
  );
}

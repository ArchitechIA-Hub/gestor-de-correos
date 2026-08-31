"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importGmailEmails } from "@/app/actions/import-gmail";
import {
  DEFAULT_GMAIL_IMPORT_LIMIT,
  MAX_GMAIL_IMPORT_LIMIT,
  MIN_GMAIL_IMPORT_LIMIT,
} from "@/lib/gmail/constants";
import { Button } from "@/components/ui/button";

export function GmailImportButton({ accountId }: { accountId: string }) {
  const [count, setCount] = useState<number>(DEFAULT_GMAIL_IMPORT_LIMIT);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const outOfRange =
    !Number.isFinite(count) || count < MIN_GMAIL_IMPORT_LIMIT || count > MAX_GMAIL_IMPORT_LIMIT;

  function handleClick() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const { imported, skipped } = await importGmailEmails(accountId, count);
        setResult(`${imported} correo(s) importado(s), ${skipped} ya existían.`);
        router.refresh();
      } catch {
        setError("No se pudo importar. Revisa que la cuenta siga conectada.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={MIN_GMAIL_IMPORT_LIMIT}
          max={MAX_GMAIL_IMPORT_LIMIT}
          value={Number.isFinite(count) ? count : ""}
          onChange={(e) => setCount(e.target.valueAsNumber)}
          aria-label="Cantidad de correos a importar"
          className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleClick}
          disabled={isPending || outOfRange}
        >
          {isPending ? "Importando…" : "Importar correos recientes"}
        </Button>
      </div>
      {outOfRange && (
        <p className="text-xs text-muted-foreground">
          Entre {MIN_GMAIL_IMPORT_LIMIT} y {MAX_GMAIL_IMPORT_LIMIT}
        </p>
      )}
      {result && <p className="text-xs text-muted-foreground">{result}</p>}
      {error && <p className="text-xs text-urgent">{error}</p>}
    </div>
  );
}

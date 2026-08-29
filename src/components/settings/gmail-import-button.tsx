"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importGmailEmails } from "@/app/actions/import-gmail";
import { Button } from "@/components/ui/button";

export function GmailImportButton({ accountId }: { accountId: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const { imported, skipped } = await importGmailEmails(accountId);
        setResult(`${imported} correo(s) importado(s), ${skipped} ya existían.`);
        router.refresh();
      } catch {
        setError("No se pudo importar. Revisa que la cuenta siga conectada.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Importando…" : "Importar 10 correos recientes"}
      </Button>
      {result && <p className="text-xs text-muted-foreground">{result}</p>}
      {error && <p className="text-xs text-urgent">{error}</p>}
    </div>
  );
}

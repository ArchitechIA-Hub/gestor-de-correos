"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameMailAccount } from "@/app/actions/mail-accounts";
import { Button } from "@/components/ui/button";

export function MailAccountRename({
  accountId,
  currentLabel,
}: {
  accountId: string;
  currentLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(currentLabel);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await renameMailAccount(accountId, label);
        setEditing(false);
        router.refresh();
      } catch {
        setError("No se pudo renombrar la cuenta.");
      }
    });
  }

  function cancel() {
    setLabel(currentLabel);
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{currentLabel}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          Renombrar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        className="h-8 min-w-[10rem] rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button type="button" size="sm" onClick={save} disabled={isPending || !label.trim()}>
        {isPending ? "Guardando…" : "Guardar"}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={cancel} disabled={isPending}>
        Cancelar
      </Button>
      {error && <span className="text-xs text-urgent">{error}</span>}
    </div>
  );
}

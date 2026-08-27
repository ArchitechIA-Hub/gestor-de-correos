"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMailAccount } from "@/app/actions/mail-accounts";
import { Button } from "@/components/ui/button";

export function MailAccountForm() {
  const [label, setLabel] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createMailAccount({ label, emailAddress });
        setLabel("");
        setEmailAddress("");
        router.refresh();
      } catch {
        setError("No se pudo agregar la cuenta. Revisa el correo y el nombre.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Nombre</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="p. ej. Trabajo"
          className="h-8 min-w-[10rem] rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Correo</label>
        <input
          type="email"
          value={emailAddress}
          onChange={(e) => setEmailAddress(e.target.value)}
          placeholder="cuenta@empresa.com"
          className="h-8 min-w-[14rem] rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending || !label.trim() || !emailAddress.trim()}>
        {isPending ? "Agregando…" : "Agregar cuenta"}
      </Button>
      {error && <p className="w-full text-xs text-urgent">{error}</p>}
    </form>
  );
}

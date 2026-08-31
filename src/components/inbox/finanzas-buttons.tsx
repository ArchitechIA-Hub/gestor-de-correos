"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveToFinanzas, removeFromFinanzas } from "@/app/actions/email-category";
import { Button } from "@/components/ui/button";

export function MoveToFinanzasButton({
  emailId,
  senderName,
}: {
  emailId: string;
  senderName: string;
}) {
  const [alsoSender, setAlsoSender] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await moveToFinanzas(emailId, alsoSender);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Moviendo…" : "Mover a Finanzas"}
      </Button>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={alsoSender}
          onChange={(e) => setAlsoSender(e.target.checked)}
          className="size-3.5"
        />
        y siempre los de {senderName}
      </label>
    </div>
  );
}

export function RemoveFromFinanzasButton({
  emailId,
  hasSenderRule,
}: {
  emailId: string;
  hasSenderRule: boolean;
}) {
  const [alsoClearRule, setAlsoClearRule] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await removeFromFinanzas(emailId, alsoClearRule);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Sacando…" : "Sacar de Finanzas"}
      </Button>
      {hasSenderRule && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={alsoClearRule}
            onChange={(e) => setAlsoClearRule(e.target.checked)}
            className="size-3.5"
          />
          y quitar la regla del remitente
        </label>
      )}
    </div>
  );
}

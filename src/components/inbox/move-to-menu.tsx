"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { moveEmailsTo, moveToFinanzas, removeFromFinanzas } from "@/app/actions/email-category";
import { INBOX_BUCKETS, type InboxBucketId } from "@/lib/inbox/buckets";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export function MoveToMenu({
  emailIds,
  currentBucket,
  sender,
  onDone,
}: {
  emailIds: string[];
  currentBucket: InboxBucketId;
  /** Solo para contextos de un único correo: habilita "aplicar al remitente". */
  sender?: { id: string; name: string; hasFinanzasRule: boolean };
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [alsoSender, setAlsoSender] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const targets = INBOX_BUCKETS.filter((b) => b.id !== currentBucket);
  const singleWithSender = sender && emailIds.length === 1;

  function handlePick(bucketId: InboxBucketId) {
    startTransition(async () => {
      if (singleWithSender && alsoSender && bucketId === "finanzas") {
        await moveToFinanzas(emailIds[0], true);
      } else if (singleWithSender && alsoSender && sender!.hasFinanzasRule && bucketId !== "finanzas") {
        await removeFromFinanzas(emailIds[0], true);
        if (bucketId === "marketing") await moveEmailsTo(emailIds, "marketing");
      } else {
        await moveEmailsTo(emailIds, bucketId);
      }
      router.refresh();
      setOpen(false);
      setAlsoSender(false);
      onDone?.();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button size="sm" variant="outline" disabled={isPending || emailIds.length === 0} />}
      >
        {isPending ? "Moviendo…" : "Mover a"}
        <ChevronDown className="ml-1 size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <ul className="flex flex-col">
          {targets.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => handlePick(b.id)}
                disabled={isPending}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-secondary/60 disabled:opacity-50"
              >
                {b.label}
              </button>
            </li>
          ))}
        </ul>
        {singleWithSender && (
          <label className="mt-1 flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={alsoSender}
              onChange={(e) => setAlsoSender(e.target.checked)}
              className="size-3.5"
            />
            y aplicar la regla a todos los de {sender!.name}
          </label>
        )}
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setDigestRecipient } from "@/app/actions/digest-settings";
import { sendDigest } from "@/app/actions/send-digest";
import { useTimeZone } from "@/components/providers/timezone-provider";
import { formatTime } from "@/lib/format/date";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

export function SendDigestControl({
  range,
  initialRecipient,
}: {
  range: "daily" | "weekly";
  initialRecipient: string | null;
}) {
  const timeZone = useTimeZone();
  const [recipient, setRecipient] = useState(initialRecipient ?? "");
  const [savedRecipient, setSavedRecipient] = useState(initialRecipient);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleSaveRecipient() {
    setError(null);
    startTransition(async () => {
      try {
        const updated = await setDigestRecipient(recipient);
        setSavedRecipient(updated.digestRecipientEmail);
      } catch {
        setError("Correo inválido. Revisa el formato.");
      }
    });
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendDigest({ range });
        setConfirmation(
          `Enviado a ${result.recipientEmail} · ${formatTime(result.sentAt, timeZone)}`
        );
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo enviar el informe.");
        setOpen(false);
      }
    });
  }

  const recipientDirty = recipient.trim() !== (savedRecipient ?? "");

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">Enviar este informe por correo</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="destinatario@empresa.com"
          className="h-8 min-w-[14rem] rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {recipientDirty && (
          <Button size="sm" variant="outline" onClick={handleSaveRecipient} disabled={isPending}>
            Guardar destinatario
          </Button>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" disabled={!savedRecipient || recipientDirty || isPending} />}>
            Enviar informe
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Enviar este informe?</DialogTitle>
              <DialogDescription>
                Se enviará un correo real a <strong>{savedRecipient}</strong> desde la cuenta de Gmail conectada.
                Esta acción queda registrada en el log de auditoría.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button onClick={handleSend} disabled={isPending}>
                {isPending ? "Enviando…" : "Confirmar envío"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {error && <p className="text-xs text-urgent">{error}</p>}
      {confirmation && <p className="text-xs text-muted-foreground">{confirmation}</p>}
    </div>
  );
}

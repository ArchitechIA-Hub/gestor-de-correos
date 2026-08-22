"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revertAudit } from "@/app/actions/revert-audit";
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

export function RevertButton({ auditLogEntryId, disabled }: { auditLogEntryId: string; disabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      await revertAudit(auditLogEntryId);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" disabled={disabled} />}>
        Revertir
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Revertir esta acción?</DialogTitle>
          <DialogDescription>Esto restaurará el estado previo a esta acción automática.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Revirtiendo…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

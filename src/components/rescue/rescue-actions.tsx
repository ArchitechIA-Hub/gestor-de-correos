"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCommitmentStatus } from "@/app/actions/update-commitment-status";
import { Button } from "@/components/ui/button";

export function RescueActions({ commitmentId }: { commitmentId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handle(status: "COMPLETED" | "CANCELLED") {
    startTransition(async () => {
      await updateCommitmentStatus(commitmentId, status);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => handle("COMPLETED")} disabled={isPending}>
        {isPending ? "…" : "Marcar cumplido"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => handle("CANCELLED")} disabled={isPending}>
        Cancelar
      </Button>
    </div>
  );
}

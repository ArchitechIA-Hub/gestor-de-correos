"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { unmarkMarketing } from "@/app/actions/unmark-marketing";
import { Button } from "@/components/ui/button";

export function UnmarkMarketingButton({ emailId }: { emailId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await unmarkMarketing(emailId);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
      {isPending ? "Restaurando…" : "No es marketing"}
    </Button>
  );
}

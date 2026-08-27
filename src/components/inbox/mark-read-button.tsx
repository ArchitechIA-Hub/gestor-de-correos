"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEmailReadState } from "@/app/actions/mark-email-read";
import { Button } from "@/components/ui/button";

export function MarkReadButton({ emailId, isRead }: { emailId: string; isRead: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await setEmailReadState(emailId, !isRead);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
      {isPending ? "…" : isRead ? "Marcar no leído" : "Marcar leído"}
    </Button>
  );
}

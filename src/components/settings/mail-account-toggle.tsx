"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMailAccountActive } from "@/app/actions/mail-accounts";
import { Switch } from "@/components/ui/switch";

export function MailAccountToggle({ accountId, checked }: { accountId: string; checked: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(value: boolean) {
    startTransition(async () => {
      await setMailAccountActive(accountId, value);
      router.refresh();
    });
  }

  return <Switch checked={checked} onCheckedChange={handleChange} disabled={isPending} />;
}

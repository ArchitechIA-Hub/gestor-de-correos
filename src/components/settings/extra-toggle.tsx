"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleExtra } from "@/app/actions/toggle-extra";
import type { ExtraFlagKey } from "@/lib/extras";
import { Switch } from "@/components/ui/switch";

export function ExtraToggle({
  flagKey,
  label,
  description,
  checked,
}: {
  flagKey: ExtraFlagKey;
  label: string;
  description: string;
  checked: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(value: boolean) {
    startTransition(async () => {
      await toggleExtra(flagKey, value);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={handleChange} disabled={isPending} />
    </div>
  );
}

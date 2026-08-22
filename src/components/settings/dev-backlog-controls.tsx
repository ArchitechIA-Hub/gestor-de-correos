"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { devSeedBacklog } from "@/app/actions/dev-seed-backlog";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { label: "+50 correos", count: 50 },
  { label: "+300 correos (cruza a Nivel 2)", count: 300 },
  { label: "+900 correos (cruza a Nivel 3)", count: 900 },
  { label: "+2000 correos (cruza a Nivel 4)", count: 2000 },
];

export function DevBacklogControls() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd(count: number) {
    startTransition(async () => {
      await devSeedBacklog(count);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((opt) => (
        <Button key={opt.count} size="sm" variant="outline" disabled={isPending} onClick={() => handleAdd(opt.count)}>
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

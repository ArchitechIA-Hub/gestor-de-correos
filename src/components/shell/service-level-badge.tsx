import { getCurrentServiceLevel } from "@/lib/priority/current";
import { requireSession } from "@/lib/auth/session";
import Link from "next/link";

export async function ServiceLevelBadge() {
  const { organizationId } = await requireSession();
  const { level, name, backlogCount } = await getCurrentServiceLevel(organizationId);

  return (
    <Link
      href="/settings/service-level"
      className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/20"
    >
      <span className="font-heading text-sm text-foreground">Nivel {level}</span>
      <span>{name}</span>
      <span className="text-border">·</span>
      <span>{backlogCount} sin clasificar</span>
    </Link>
  );
}

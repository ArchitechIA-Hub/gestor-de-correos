import Link from "next/link";
import { NavLinks } from "@/components/shell/nav-links";
import { ServiceLevelBadge } from "@/components/shell/service-level-badge";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/inbox" className="font-heading text-lg tracking-tight text-foreground">
              Bandeja Ejecutiva
            </Link>
            <NavLinks />
          </div>
          <ServiceLevelBadge />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}

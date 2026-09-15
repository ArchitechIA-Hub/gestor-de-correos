import Link from "next/link";
import { NavLinks } from "@/components/shell/nav-links";
import { ServiceLevelBadge } from "@/components/shell/service-level-badge";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UrgentAlertsBell } from "@/components/alerts/urgent-alerts-bell";
import { TimeZoneProvider } from "@/components/providers/timezone-provider";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { getUnreadUrgentAlerts } from "@/lib/alerts";
import { getUserTimeZone } from "@/lib/settings";
import { logout } from "@/app/login/actions";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { organizationId } = await requireSession();
  const [{ features }, unreadAlerts, timeZone] = await Promise.all([
    getCurrentServiceLevel(organizationId),
    getUnreadUrgentAlerts(organizationId),
    getUserTimeZone(organizationId),
  ]);

  return (
    <TimeZoneProvider timeZone={timeZone}>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-8">
              <Link href="/inbox" className="font-heading text-lg tracking-tight text-foreground">
                Bandeja Ejecutiva
              </Link>
              <NavLinks rescueModeEnabled={features.rescueMode} />
            </div>
            <div className="flex items-center gap-3">
              <UrgentAlertsBell
                // El layout es un server component: tras un scan, la ruta se
                // revalida y este árbol se vuelve a renderizar con nuevos
                // `unreadAlerts`, pero el client component no se desmonta por
                // sí solo, así que su useState() nunca vería el cambio. La key
                // (ids concatenados) fuerza el remount cuando cambia el set de
                // alertas sin leer que llega del servidor.
                key={unreadAlerts.map((a) => a.id).join(",")}
                initialAlerts={unreadAlerts.map((a: (typeof unreadAlerts)[number]) => ({
                  id: a.id,
                  emailId: a.emailId,
                  message: a.message,
                  dueAt: a.dueAt,
                  createdAt: a.createdAt,
                }))}
              />
              <ServiceLevelBadge />
              <ThemeToggle />
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </TimeZoneProvider>
  );
}

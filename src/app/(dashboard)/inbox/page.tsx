import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { ScanButton } from "@/components/inbox/scan-button";
import { InboxTable, type InboxRow } from "@/components/inbox/inbox-table";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { getActiveMailAccounts } from "@/lib/mail-accounts";
import { getUserTimeZone } from "@/lib/settings";
import { EMAIL_CATEGORY_FINANZAS } from "@/lib/scan/constants";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function buildHref(params: { account?: string; view?: string; read?: string }) {
  const search = new URLSearchParams();
  if (params.account) search.set("account", params.account);
  if (params.view && params.view !== "priorizados") search.set("view", params.view);
  if (params.read) search.set("read", params.read);
  const query = search.toString();
  return `/inbox${query ? `?${query}` : ""}`;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; view?: string; read?: string }>;
}) {
  const { account: accountId, view, read } = await searchParams;
  const isMarketingView = view === "marketing";
  const isFinanzasView = view === "finanzas";

  const [{ backlogCount }, accounts, tz] = await Promise.all([
    getCurrentServiceLevel(),
    getActiveMailAccounts(),
    getUserTimeZone(),
  ]);

  const accountFilter = accountId ? { mailAccountId: accountId } : {};
  const readFilter = isMarketingView
    ? {}
    : read === "unread"
      ? { readAt: null }
      : read === "read"
        ? { readAt: { not: null } }
        : {};

  const emails = isMarketingView
    ? await prisma.email.findMany({
        where: { status: "ARCHIVED", isMarketing: true, ...accountFilter },
        include: { sender: true, mailAccount: true },
        orderBy: { receivedAt: "desc" },
        take: 50,
      })
    : await prisma.email.findMany({
        where: {
          status: "CLASSIFIED",
          isMarketing: false,
          category: isFinanzasView ? EMAIL_CATEGORY_FINANZAS : null,
          ...accountFilter,
          ...readFilter,
        },
        include: {
          sender: true,
          mailAccount: true,
          commitments: { where: { status: { in: ["PENDING", "OVERDUE"] } }, orderBy: { dueAt: "asc" }, take: 1 },
        },
        orderBy: [{ priorityScore: "desc" }, { receivedAt: "desc" }],
        take: 50,
      });

  const rows: InboxRow[] = emails.map((e) => {
    const commitments = (e as { commitments?: { description: string; dueAt: Date | null }[] }).commitments;
    return {
      id: e.id,
      subject: e.subject,
      receivedAt: e.receivedAt,
      readAt: e.readAt,
      respondedAt: e.respondedAt,
      isUrgent: e.isUrgent,
      isMarketing: e.isMarketing,
      marketingReason: e.marketingReason,
      priorityScore: e.priorityScore,
      sender: { name: e.sender.name, isVip: e.sender.isVip, organization: e.sender.organization },
      mailAccount: { label: e.mailAccount.label },
      commitments: commitments?.map((c) => ({ description: c.description, dueAt: c.dueAt })),
    };
  });

  const emptyMessage = isMarketingView
    ? "No hay correos de marketing ignorados en este momento."
    : isFinanzasView
      ? "No hay correos en Finanzas."
      : read === "unread"
        ? "No hay correos sin leer."
        : read === "read"
          ? "No hay correos leídos."
          : "Todavía no hay correos clasificados. Escanea el backlog para empezar.";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Bandeja priorizada</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ordenada por urgencia real e importancia del remitente — no por fecha de llegada.
          </p>
        </div>
        <ScanButton backlogCount={backlogCount} />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="lg:w-48 lg:shrink-0">
          <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Cuentas</p>
          <nav className="mt-2 flex flex-row flex-wrap gap-1 text-sm lg:flex-col lg:flex-nowrap lg:gap-0.5">
            <Link
              href={buildHref({ view, read })}
              className={cn(
                "rounded-md px-2 py-1.5",
                !accountId ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              Todas
            </Link>
            {accounts.map((account) => (
              <Link
                key={account.id}
                href={buildHref({ account: account.id, view, read })}
                className={cn(
                  "truncate rounded-md px-2 py-1.5 lg:max-w-full",
                  accountId === account.id
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary/60"
                )}
              >
                {account.label}
              </Link>
            ))}
          </nav>

          <p className="mt-5 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Vista</p>
          <nav className="mt-2 flex flex-row flex-wrap gap-1 text-sm lg:flex-col lg:flex-nowrap lg:gap-0.5">
            <Link
              href={buildHref({ account: accountId, view: "priorizados", read })}
              className={cn(
                "rounded-md px-2 py-1.5",
                !isMarketingView && !isFinanzasView
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              Priorizados
            </Link>
            <Link
              href={buildHref({ account: accountId, view: "finanzas", read })}
              className={cn(
                "rounded-md px-2 py-1.5",
                isFinanzasView ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              Finanzas
            </Link>
            <Link
              href={buildHref({ account: accountId, view: "marketing", read })}
              className={cn(
                "rounded-md px-2 py-1.5",
                isMarketingView ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              Marketing ignorado
            </Link>
          </nav>

          {!isMarketingView && (
            <>
              <p className="mt-5 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Estado</p>
              <nav className="mt-2 flex flex-row flex-wrap gap-1 text-sm lg:flex-col lg:flex-nowrap lg:gap-0.5">
                {[
                  { key: undefined, label: "Todos" },
                  { key: "unread", label: "Sin leer" },
                  { key: "read", label: "Leídos" },
                ].map((opt) => (
                  <Link
                    key={opt.label}
                    href={buildHref({ account: accountId, view, read: opt.key })}
                    className={cn(
                      "rounded-md px-2 py-1.5",
                      (read ?? undefined) === opt.key
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-secondary/60"
                    )}
                  >
                    {opt.label}
                  </Link>
                ))}
              </nav>
            </>
          )}
        </aside>

        <InboxTable emails={rows} view={view} tz={tz} emptyMessage={emptyMessage} />
      </div>
    </div>
  );
}

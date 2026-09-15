import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { ScanButton } from "@/components/inbox/scan-button";
import { InboxTable, type InboxRow } from "@/components/inbox/inbox-table";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { getActiveMailAccounts } from "@/lib/mail-accounts";
import { getUserTimeZone } from "@/lib/settings";
import { requireSession } from "@/lib/auth/session";
import { EMAIL_CATEGORY_FINANZAS } from "@/lib/scan/constants";
import { INBOX_PAGE_SIZE } from "@/lib/inbox/constants";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function buildHref(params: { account?: string; view?: string; read?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.account) search.set("account", params.account);
  if (params.view && params.view !== "priorizados") search.set("view", params.view);
  if (params.read) search.set("read", params.read);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return `/inbox${query ? `?${query}` : ""}`;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; view?: string; read?: string; page?: string }>;
}) {
  const { organizationId } = await requireSession();
  const { account: accountId, view, read, page: pageParam } = await searchParams;
  const isMarketingView = view === "marketing";
  const isFinanzasView = view === "finanzas";
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const skip = (page - 1) * INBOX_PAGE_SIZE;

  const [{ backlogCount }, accounts, tz] = await Promise.all([
    getCurrentServiceLevel(organizationId),
    getActiveMailAccounts(organizationId),
    getUserTimeZone(organizationId),
  ]);

  const accountFilter = accountId ? { mailAccountId: accountId } : {};
  const readFilter = isMarketingView
    ? {}
    : read === "unread"
      ? { readAt: null }
      : read === "read"
        ? { readAt: { not: null } }
        : {};

  // Priorizados deja pasar además lo urgente de Finanzas: la urgencia por
  // vencimiento <48h anula el ruteo por categoría, no solo el nivel de
  // servicio (ver CLAUDE.md). Finanzas sigue mostrando todo lo suyo sin
  // filtrar por urgencia.
  const categoryFilter = isFinanzasView
    ? { category: EMAIL_CATEGORY_FINANZAS }
    : { OR: [{ category: null }, { category: EMAIL_CATEGORY_FINANZAS, isUrgent: true }] };

  const marketingWhere = { organizationId, status: "ARCHIVED" as const, isMarketing: true, ...accountFilter };
  const classifiedWhere = {
    organizationId,
    status: "CLASSIFIED" as const,
    isMarketing: false,
    ...categoryFilter,
    ...accountFilter,
    ...readFilter,
  };

  const [emails, totalCount] = isMarketingView
    ? await Promise.all([
        prisma.email.findMany({
          where: marketingWhere,
          include: { sender: true, mailAccount: true },
          orderBy: { receivedAt: "desc" },
          skip,
          take: INBOX_PAGE_SIZE,
        }),
        prisma.email.count({ where: marketingWhere }),
      ])
    : await Promise.all([
        prisma.email.findMany({
          where: classifiedWhere,
          include: {
            sender: true,
            mailAccount: true,
            commitments: { where: { status: { in: ["PENDING", "OVERDUE"] } }, orderBy: { dueAt: "asc" }, take: 1 },
          },
          orderBy: [{ priorityScore: "desc" }, { receivedAt: "desc" }],
          skip,
          take: INBOX_PAGE_SIZE,
        }),
        prisma.email.count({ where: classifiedWhere }),
      ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / INBOX_PAGE_SIZE));

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
      sender: { id: e.sender.id, name: e.sender.name, isVip: e.sender.isVip, organization: e.sender.organization },
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

      <div className="flex flex-col gap-4">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
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
                "truncate rounded-md px-2 py-1.5",
                accountId === account.id
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              {account.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full bg-muted p-1 text-sm">
            <Link
              href={buildHref({ account: accountId, view: "priorizados", read })}
              className={cn(
                "rounded-full px-3 py-1.5 transition-colors",
                !isMarketingView && !isFinanzasView
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Priorizados
            </Link>
            <Link
              href={buildHref({ account: accountId, view: "finanzas", read })}
              className={cn(
                "rounded-full px-3 py-1.5 transition-colors",
                isFinanzasView ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Finanzas
            </Link>
            <Link
              href={buildHref({ account: accountId, view: "marketing", read })}
              className={cn(
                "rounded-full px-3 py-1.5 transition-colors",
                isMarketingView ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Marketing ignorado
            </Link>
          </div>

          {!isMarketingView && (
            <nav className="flex items-center gap-4 border-b border-border text-sm">
              {[
                { key: undefined, label: "Todos" },
                { key: "unread", label: "Sin leer" },
                { key: "read", label: "Leídos" },
              ].map((opt) => {
                const active = (read ?? undefined) === opt.key;
                return (
                  <Link
                    key={opt.label}
                    href={buildHref({ account: accountId, view, read: opt.key })}
                    className={cn(
                      "-mb-px border-b-2 px-1 pb-2 transition-colors",
                      active
                        ? "border-primary font-medium text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        <InboxTable key={`${view}-${read}-${page}`} emails={rows} view={view} tz={tz} emptyMessage={emptyMessage} />

        {totalCount > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {page} de {totalPages} · {totalCount} correo{totalCount === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  href={buildHref({ account: accountId, view, read, page: page - 1 })}
                  className="rounded-md px-2 py-1.5 hover:bg-secondary/60 hover:text-foreground"
                >
                  Anterior
                </Link>
              ) : (
                <span className="rounded-md px-2 py-1.5 opacity-40">Anterior</span>
              )}
              {page < totalPages ? (
                <Link
                  href={buildHref({ account: accountId, view, read, page: page + 1 })}
                  className="rounded-md px-2 py-1.5 hover:bg-secondary/60 hover:text-foreground"
                >
                  Siguiente
                </Link>
              ) : (
                <span className="rounded-md px-2 py-1.5 opacity-40">Siguiente</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

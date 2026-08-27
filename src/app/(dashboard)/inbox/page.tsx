import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScanButton } from "@/components/inbox/scan-button";
import { UnmarkMarketingButton } from "@/components/inbox/unmark-marketing-button";
import { MarkReadButton } from "@/components/inbox/mark-read-button";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { getActiveMailAccounts } from "@/lib/mail-accounts";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function buildHref(params: { account?: string; view?: string }) {
  const search = new URLSearchParams();
  if (params.account) search.set("account", params.account);
  if (params.view && params.view !== "priorizados") search.set("view", params.view);
  const query = search.toString();
  return `/inbox${query ? `?${query}` : ""}`;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; view?: string }>;
}) {
  const { account: accountId, view } = await searchParams;
  const isMarketingView = view === "marketing";

  const [{ backlogCount }, accounts] = await Promise.all([getCurrentServiceLevel(), getActiveMailAccounts()]);

  const accountFilter = accountId ? { mailAccountId: accountId } : {};

  const emails = isMarketingView
    ? await prisma.email.findMany({
        where: { status: "ARCHIVED", isMarketing: true, ...accountFilter },
        include: { sender: true, mailAccount: true },
        orderBy: { receivedAt: "desc" },
        take: 50,
      })
    : await prisma.email.findMany({
        where: { status: "CLASSIFIED", isMarketing: false, ...accountFilter },
        include: {
          sender: true,
          mailAccount: true,
          commitments: { where: { status: { in: ["PENDING", "OVERDUE"] } }, orderBy: { dueAt: "asc" }, take: 1 },
        },
        orderBy: [{ priorityScore: "desc" }, { receivedAt: "desc" }],
        take: 50,
      });

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
              href={buildHref({ view })}
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
                href={buildHref({ account: account.id, view })}
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
              href={buildHref({ account: accountId, view: "priorizados" })}
              className={cn(
                "rounded-md px-2 py-1.5",
                !isMarketingView ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              Priorizados
            </Link>
            <Link
              href={buildHref({ account: accountId, view: "marketing" })}
              className={cn(
                "rounded-md px-2 py-1.5",
                isMarketingView ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              Marketing ignorado
            </Link>
          </nav>
        </aside>

        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border">
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="py-2 text-xs">Remitente</TableHead>
              <TableHead className="py-2 text-xs">Cuenta</TableHead>
              <TableHead className="py-2 text-xs">Asunto</TableHead>
              {isMarketingView ? (
                <TableHead className="py-2 text-xs">Motivo</TableHead>
              ) : (
                <TableHead className="py-2 text-xs">Compromiso</TableHead>
              )}
              <TableHead className="py-2 text-xs">Recibido</TableHead>
              <TableHead className="py-2 text-right text-xs whitespace-nowrap">{isMarketingView ? "" : "Prioridad"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emails.map((email) => {
              const nearest = isMarketingView
                ? undefined
                : (email as unknown as { commitments: { description: string; dueAt: Date | null }[] }).commitments[0];
              const isUnread = !isMarketingView && !email.readAt;
              return (
                <TableRow key={email.id} className={isMarketingView ? undefined : "cursor-pointer"}>
                  <TableCell className="py-1.5">
                    <Link href={`/inbox/${email.id}`} className="block">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm text-foreground", isUnread ? "font-bold" : "font-medium")}>
                          {email.sender.name}
                        </span>
                        {email.sender.isVip && (
                          <Badge className="bg-vip text-vip-foreground">VIP</Badge>
                        )}
                      </div>
                      {email.sender.organization && (
                        <span className="text-xs text-muted-foreground">{email.sender.organization}</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                    {email.mailAccount.label}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Link
                      href={`/inbox/${email.id}`}
                      className={cn("line-clamp-1 block max-w-2xs text-sm", isUnread && "font-bold text-foreground")}
                    >
                      {email.subject}
                    </Link>
                  </TableCell>
                  {isMarketingView ? (
                    <TableCell className="max-w-2xs py-1.5">
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {email.marketingReason ?? "—"}
                      </span>
                    </TableCell>
                  ) : (
                    <TableCell className="max-w-2xs py-1.5">
                      {nearest ? (
                        <div className="flex flex-col">
                          <span className="line-clamp-1 text-xs">{nearest.description}</span>
                          {nearest.dueAt && (
                            <span className="text-xs text-muted-foreground">Vence {formatDate(nearest.dueAt)}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                    {formatDate(email.receivedAt)}
                  </TableCell>
                  <TableCell className="py-1.5 text-right whitespace-nowrap">
                    {isMarketingView ? (
                      <UnmarkMarketingButton emailId={email.id} />
                    ) : (
                      <div className="flex flex-col items-end gap-1.5">
                        {email.isUrgent ? (
                          <Badge className="bg-urgent text-urgent-foreground">Urgente &lt;48h</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{email.priorityScore.toFixed(2)}</span>
                        )}
                        {email.respondedAt && <Badge variant="secondary">Respondido</Badge>}
                        <MarkReadButton emailId={email.id} isRead={!!email.readAt} />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {emails.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  {isMarketingView
                    ? "No hay correos de marketing ignorados en este momento."
                    : "Todavía no hay correos clasificados. Escanea el backlog para empezar."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
        </div>
      </div>
    </div>
  );
}

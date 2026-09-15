import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { getAppSettings, getUserTimeZone } from "@/lib/settings";
import { formatLongDate } from "@/lib/format/date";
import { SendDigestControl } from "@/components/digest/send-digest-control";
import { getDigestData, DIGEST_STATUS_LABELS, suggestedDigestAction } from "@/lib/digest/get-digest-data";

export const dynamic = "force-dynamic";

export default async function DigestPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { organizationId } = await requireSession();
  const { range } = await searchParams;
  const isWeekly = range !== "daily";

  const [{ rangeStart, rangeEnd, emails, activeCommitments, overdueCommitments, vipSendersUnanswered }, appSettings, organization] =
    await Promise.all([
      getDigestData(organizationId, isWeekly ? "weekly" : "daily"),
      getAppSettings(organizationId),
      prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    ]);

  const tz = await getUserTimeZone(organizationId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Informe de {organization.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatLongDate(rangeStart, tz)} — {formatLongDate(rangeEnd, tz)}
        </p>
        <div className="mt-3 flex gap-2 text-sm">
          <Link
            href="/digest?range=daily"
            className={cn("rounded-md px-2 py-1", !isWeekly ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60")}
          >
            Diario
          </Link>
          <Link
            href="/digest?range=weekly"
            className={cn("rounded-md px-2 py-1", isWeekly ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60")}
          >
            Semanal
          </Link>
        </div>
      </div>

      <SendDigestControl
        range={isWeekly ? "weekly" : "daily"}
        initialRecipient={appSettings.digestRecipientEmail}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Compromisos activos</p>
          <p className="font-heading text-3xl text-foreground">{activeCommitments}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Correos vencidos</p>
          <p className="font-heading text-3xl text-urgent">{overdueCommitments}</p>
        </div>
      </div>

      <div>
        <h2 className="font-heading text-lg text-foreground">Correos del periodo</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Remitente</TableHead>
                <TableHead>Asunto</TableHead>
                <TableHead>Recibido</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Compromiso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acción sugerida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((email) => {
                const commitment = email.commitments[0];
                const latestDraft = email.drafts[0];
                return (
                  <TableRow key={email.id}>
                    <TableCell>
                      <Link href={`/inbox/${email.id}`} className="flex items-center gap-1.5">
                        {email.sender.name}
                        {email.sender.isVip && <Badge className="bg-vip text-vip-foreground">VIP</Badge>}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <span className="line-clamp-1">{email.subject}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatLongDate(email.receivedAt, tz)}
                    </TableCell>
                    <TableCell>
                      {email.isUrgent ? (
                        <Badge className="bg-urgent text-urgent-foreground">Urgente</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{email.priorityScore.toFixed(2)}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[14rem]">
                      <span className="line-clamp-1 text-sm">{commitment?.description ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {DIGEST_STATUS_LABELS[email.status] ?? email.status}
                    </TableCell>
                    <TableCell className="max-w-[14rem] text-sm">
                      {suggestedDigestAction({
                        isUrgent: email.isUrgent,
                        hasPendingDraft: latestDraft?.status === "PENDING_REVIEW",
                        hasApprovedDraft: latestDraft?.status === "APPROVED",
                        hasCommitment: !!commitment,
                      })}
                    </TableCell>
                  </TableRow>
                );
              })}
              {emails.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No hay correos en este periodo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h2 className="font-heading text-lg text-foreground">Remitentes VIP sin respuesta</h2>
        {vipSendersUnanswered.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Todos los remitentes VIP tienen respuesta aprobada.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {vipSendersUnanswered.map((sender: (typeof vipSendersUnanswered)[number]) => (
              <li key={sender.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{sender.name}</span>
                    <Badge className="bg-vip text-vip-foreground">VIP</Badge>
                  </div>
                  {sender.emails[0] && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Último correo: {sender.emails[0].subject} · {formatLongDate(sender.emails[0].receivedAt, tz)}
                    </p>
                  )}
                </div>
                {sender.emails[0] && (
                  <Link href={`/inbox/${sender.emails[0].id}`} className="text-sm text-primary underline-offset-4 hover:underline">
                    Ver hilo
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

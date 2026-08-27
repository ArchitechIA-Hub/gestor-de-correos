import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CURRENT_USER_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";
import { getAppSettings } from "@/lib/settings";
import { SendDigestControl } from "@/components/digest/send-digest-control";

function formatDate(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

const STATUS_LABELS: Record<string, string> = {
  UNCLASSIFIED: "Sin clasificar",
  CLASSIFIED: "Clasificado",
  ARCHIVED: "Archivado",
};

function suggestedAction(params: {
  isUrgent: boolean;
  hasPendingDraft: boolean;
  hasApprovedDraft: boolean;
  hasCommitment: boolean;
}) {
  if (params.isUrgent) return "Responder ya — vence en <48h";
  if (params.hasApprovedDraft) return "Listo para enviar (fuera de alcance del prototipo)";
  if (params.hasPendingDraft) return "Revisar y aprobar borrador";
  if (params.hasCommitment) return "Generar borrador";
  return "Sin acción requerida";
}

export default async function DigestPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const isWeekly = range !== "daily";
  const rangeStart = new Date(Date.now() - (isWeekly ? 7 : 1) * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date();

  const emails = await prisma.email.findMany({
    where: { receivedAt: { gte: rangeStart, lte: rangeEnd }, isMarketing: false },
    include: {
      sender: true,
      commitments: { orderBy: { dueAt: "asc" }, take: 1 },
      drafts: { orderBy: { generatedAt: "desc" }, take: 1 },
    },
    orderBy: [{ priorityScore: "desc" }, { receivedAt: "desc" }],
  });

  const [activeCommitments, overdueCommitments, vipSendersUnanswered, appSettings] = await Promise.all([
    prisma.commitment.count({ where: { status: "PENDING" } }),
    prisma.commitment.count({ where: { status: "OVERDUE" } }),
    prisma.sender.findMany({
      where: {
        isVip: true,
        emails: { some: { drafts: { none: { status: "APPROVED" } } } },
      },
      include: {
        emails: {
          where: { drafts: { none: { status: "APPROVED" } } },
          orderBy: { receivedAt: "desc" },
          take: 1,
        },
      },
    }),
    getAppSettings(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Informe de {CURRENT_USER_NAME}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(rangeStart)} — {formatDate(rangeEnd)}
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
                      {formatDate(email.receivedAt)}
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
                      {STATUS_LABELS[email.status] ?? email.status}
                    </TableCell>
                    <TableCell className="max-w-[14rem] text-sm">
                      {suggestedAction({
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
                      Último correo: {sender.emails[0].subject} · {formatDate(sender.emails[0].receivedAt)}
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

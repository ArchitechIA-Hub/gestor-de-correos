import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DraftPanel } from "@/components/inbox/draft-panel";
import { MarkReadButton } from "@/components/inbox/mark-read-button";
import { AutoMarkRead } from "@/components/inbox/auto-mark-read";
import { MoveToMenu } from "@/components/inbox/move-to-menu";
import { RevertButton } from "@/components/audit/revert-button";
import type { InboxBucketId } from "@/lib/inbox/buckets";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { getExtraConfig } from "@/lib/extras";
import { computeVipSlaStatus } from "@/lib/priority/sla";
import { buildGoogleCalendarUrl } from "@/lib/calendar/links";
import { getUserTimeZone } from "@/lib/settings";
import { getEmailAuditTrail } from "@/lib/audit/email-trail";
import { getEmailThread } from "@/lib/inbox/thread";
import { AUDIT_ACTION_LABELS } from "@/lib/audit/labels";
import { EMAIL_CATEGORY_FINANZAS } from "@/lib/scan/constants";
import { formatLongDateTime, formatShortDateTime } from "@/lib/format/date";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const COMMITMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  COMPLETED: "Cumplido",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
};

export default async function EmailThreadPage({
  params,
}: {
  params: Promise<{ emailId: string }>;
}) {
  const { emailId } = await params;

  const [email, { features }, extraConfig, tz, trail] = await Promise.all([
    prisma.email.findUnique({
      where: { id: emailId },
      include: {
        sender: true,
        mailAccount: true,
        commitments: { orderBy: { dueAt: "asc" }, include: { calendarEvent: true, whatsAppNotifications: true } },
        drafts: { orderBy: { generatedAt: "desc" } },
        attachments: true,
      },
    }),
    getCurrentServiceLevel(),
    getExtraConfig(),
    getUserTimeZone(),
    getEmailAuditTrail(emailId),
  ]);

  if (!email) notFound();

  const thread = await getEmailThread(email.threadId, email.id);

  const vipSlaStatus = extraConfig.vipSlaEnabled
    ? computeVipSlaStatus({
        isVip: email.sender.isVip,
        receivedAt: email.receivedAt,
        hasApprovedResponse: email.respondedAt !== null,
      })
    : "not_applicable";

  return (
    <div className="flex flex-col gap-8">
      <AutoMarkRead emailId={email.id} alreadyRead={!!email.readAt} />
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl text-foreground">{email.subject}</h1>
            {email.isUrgent && <Badge className="bg-urgent text-urgent-foreground">Urgente &lt;48h</Badge>}
            {email.respondedAt && <Badge variant="secondary">Respondido</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <MoveToMenu
              emailIds={[email.id]}
              currentBucket={
                (email.category === EMAIL_CATEGORY_FINANZAS
                  ? "finanzas"
                  : email.isMarketing
                    ? "marketing"
                    : "inbox") as InboxBucketId
              }
              sender={{
                id: email.senderId,
                name: email.sender.name,
                hasFinanzasRule: email.sender.autoCategory === EMAIL_CATEGORY_FINANZAS,
              }}
            />
            <MarkReadButton emailId={email.id} isRead={!!email.readAt} />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{email.sender.name}</span>
          {email.sender.isVip && <Badge className="bg-vip text-vip-foreground">VIP</Badge>}
          {email.category === EMAIL_CATEGORY_FINANZAS && <Badge variant="outline">Finanzas</Badge>}
          {email.sender.autoCategory === EMAIL_CATEGORY_FINANZAS && (
            <Badge variant="outline">Regla: Finanzas</Badge>
          )}
          {vipSlaStatus === "breached" && <Badge className="bg-urgent text-urgent-foreground">SLA VIP incumplido</Badge>}
          {vipSlaStatus === "compliant" && <Badge variant="secondary">SLA VIP cumplido</Badge>}
          {email.sender.organization && <span>· {email.sender.organization}</span>}
          <span>· {formatLongDateTime(email.receivedAt, tz)}</span>
          <span>· Recibido en {email.mailAccount.label}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        {email.summary ? (
          <>
            <p className="text-sm leading-relaxed text-foreground">{email.summary}</p>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Ver correo completo
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{email.rawBody}</p>
            </details>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{email.rawBody}</p>
        )}
      </div>

      {thread.length > 0 && (
        <div>
          <h2 className="font-heading text-lg text-foreground">Conversación</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {thread.length} mensajes en este hilo, del más antiguo al más reciente.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {thread.map((item) =>
              item.kind === "received" ? (
                <li
                  key={item.id}
                  className={
                    "rounded-lg border p-3 text-sm " +
                    (item.isCurrent ? "border-primary/40 bg-card" : "border-border bg-card")
                  }
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{item.senderName}</span>
                    <span>{formatShortDateTime(item.at, tz)}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                    {item.summary ?? item.body.slice(0, 400)}
                  </p>
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Ver mensaje completo
                    </summary>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                  </details>
                  {item.isCurrent ? (
                    <p className="mt-1.5 text-xs text-primary">Este correo</p>
                  ) : (
                    <a
                      href={`/inbox/${item.id}`}
                      className="mt-1.5 inline-block text-xs text-primary underline-offset-4 hover:underline"
                    >
                      Abrir
                    </a>
                  )}
                </li>
              ) : (
                <li key={item.id} className="ml-8 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Tú · respuesta enviada</span>
                    <span>{formatShortDateTime(item.at, tz)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{item.body}</p>
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {email.attachments.length > 0 && (
        <div>
          <h2 className="font-heading text-lg text-foreground">Adjuntos</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {email.attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3 text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">{a.filename}</span>
                  <p className="text-xs text-muted-foreground">
                    {a.mimeType} · {formatFileSize(a.sizeBytes)}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <a
                    href={`/api/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Ver
                  </a>
                  <a
                    href={`/api/attachments/${a.id}?download=1`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Descargar
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {email.commitments.length > 0 && (
        <div>
          <h2 className="font-heading text-lg text-foreground">Compromisos detectados</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {email.commitments.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{c.description}</span>
                  <div className="flex items-center gap-2">
                    {c.calendarEvent && <Badge variant="secondary">En calendario</Badge>}
                    {c.whatsAppNotifications.length > 0 && <Badge variant="secondary">WhatsApp enviado</Badge>}
                    <Badge variant="outline">{COMMITMENT_STATUS_LABELS[c.status] ?? c.status}</Badge>
                  </div>
                </div>
                {c.dueAt && (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">Vence {formatLongDateTime(c.dueAt, tz)} · confianza {c.confidence}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <a
                        href={buildGoogleCalendarUrl({ title: c.description, description: c.sourceExcerpt, start: c.dueAt })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Agregar a Google Calendar
                      </a>
                      <a href={`/api/calendar/${c.id}`} className="text-primary underline-offset-4 hover:underline">
                        Descargar .ics (iOS/Outlook)
                      </a>
                    </div>
                  </>
                )}
                <p className="mt-1 text-xs italic text-muted-foreground">“{c.sourceExcerpt}”</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Separator />

      <div>
        <h2 className="font-heading text-lg text-foreground">Borrador de respuesta</h2>
        <div className="mt-3">
          <DraftPanel
            emailId={email.id}
            drafts={email.drafts}
            draftGenerationEnabled={features.draftGeneration}
            mailAccountProvider={email.mailAccount.provider}
            recipientEmail={email.sender.email}
          />
        </div>
      </div>

      <Separator />

      <div>
        <h2 className="font-heading text-lg text-foreground">Historial de este correo</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cada acción del sistema o tuya sobre este correo. El detalle completo (antes → después) está en Auditoría.
        </p>
        {trail.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Sin acciones registradas todavía.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {trail.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatShortDateTime(entry.createdAt, tz)}
                </span>
                <span className="font-medium text-foreground">
                  {AUDIT_ACTION_LABELS[entry.actionType] ?? entry.actionType}
                </span>
                <Badge variant={entry.performedBy === "SYSTEM" ? "outline" : "secondary"}>
                  {entry.performedBy === "SYSTEM" ? "Sistema" : "Usuario"}
                </Badge>
                <span className="ml-auto">
                  {entry.revertedAt ? (
                    <span className="text-xs text-muted-foreground">Revertido</span>
                  ) : (
                    <RevertButton auditLogEntryId={entry.id} disabled={!entry.reversible} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

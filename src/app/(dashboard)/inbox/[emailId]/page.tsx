import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DraftPanel } from "@/components/inbox/draft-panel";
import { MarkReadButton } from "@/components/inbox/mark-read-button";
import { AutoMarkRead } from "@/components/inbox/auto-mark-read";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { getExtraConfig } from "@/lib/extras";
import { computeVipSlaStatus } from "@/lib/priority/sla";
import { buildGoogleCalendarUrl } from "@/lib/calendar/links";
import { getUserTimeZone } from "@/lib/settings";
import { formatLongDateTime } from "@/lib/format/date";

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

  const [email, { features }, extraConfig] = await Promise.all([
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
  ]);

  const tz = await getUserTimeZone();

  if (!email) notFound();

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
          <MarkReadButton emailId={email.id} isRead={!!email.readAt} />
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{email.sender.name}</span>
          {email.sender.isVip && <Badge className="bg-vip text-vip-foreground">VIP</Badge>}
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
    </div>
  );
}

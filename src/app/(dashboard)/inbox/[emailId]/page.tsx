import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DraftPanel } from "@/components/inbox/draft-panel";
import { MarkReadButton } from "@/components/inbox/mark-read-button";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { getExtraConfig } from "@/lib/extras";
import { computeVipSlaStatus } from "@/lib/priority/sla";

function formatDate(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
      },
    }),
    getCurrentServiceLevel(),
    getExtraConfig(),
  ]);

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
          <span>· {formatDate(email.receivedAt)}</span>
          <span>· Recibido en {email.mailAccount.label}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{email.rawBody}</p>
      </div>

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
                  <p className="mt-1 text-xs text-muted-foreground">Vence {formatDate(c.dueAt)} · confianza {c.confidence}</p>
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
          />
        </div>
      </div>
    </div>
  );
}

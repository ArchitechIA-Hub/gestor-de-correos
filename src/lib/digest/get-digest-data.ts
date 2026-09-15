import { prisma } from "@/lib/db/prisma";

export type DigestRange = "daily" | "weekly";

export const DIGEST_STATUS_LABELS: Record<string, string> = {
  UNCLASSIFIED: "Sin clasificar",
  CLASSIFIED: "Clasificado",
  ARCHIVED: "Archivado",
};

export function suggestedDigestAction(params: {
  isUrgent: boolean;
  hasPendingDraft: boolean;
  hasApprovedDraft: boolean;
  hasCommitment: boolean;
}): string {
  if (params.isUrgent) return "Responder ya — vence en <48h";
  if (params.hasApprovedDraft) return "Listo para enviar (fuera de alcance del prototipo)";
  if (params.hasPendingDraft) return "Revisar y aprobar borrador";
  if (params.hasCommitment) return "Generar borrador";
  return "Sin acción requerida";
}

/**
 * Única fuente de los datos del Informe (CLAUDE.md: tabla desglosada +
 * resumen numérico + sección VIP sin respuesta). Usada tanto por la página
 * `/digest` como por el correo real que se envía (manual o automático) —
 * para que nunca diverjan entre lo que se ve en la app y lo que llega al
 * correo.
 */
export async function getDigestData(organizationId: string, range: DigestRange) {
  const rangeStart = new Date(Date.now() - (range === "weekly" ? 7 : 1) * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date();

  const emails = await prisma.email.findMany({
    where: { organizationId, receivedAt: { gte: rangeStart, lte: rangeEnd }, isMarketing: false, category: null },
    include: {
      sender: true,
      commitments: { orderBy: { dueAt: "asc" }, take: 1 },
      drafts: { orderBy: { generatedAt: "desc" }, take: 1 },
    },
    orderBy: [{ priorityScore: "desc" }, { receivedAt: "desc" }],
  });

  const [activeCommitments, overdueCommitments, vipSendersUnanswered] = await Promise.all([
    prisma.commitment.count({ where: { status: "PENDING", email: { organizationId } } }),
    prisma.commitment.count({ where: { status: "OVERDUE", email: { organizationId } } }),
    prisma.sender.findMany({
      where: {
        organizationId,
        isVip: true,
        emails: { some: { organizationId, drafts: { none: { status: "APPROVED" } } } },
      },
      include: {
        emails: {
          where: { organizationId, drafts: { none: { status: "APPROVED" } } },
          orderBy: { receivedAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  return { range, rangeStart, rangeEnd, emails, activeCommitments, overdueCommitments, vipSendersUnanswered };
}

export type DigestData = Awaited<ReturnType<typeof getDigestData>>;

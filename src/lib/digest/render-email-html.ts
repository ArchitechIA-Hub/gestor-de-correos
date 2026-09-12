import { CURRENT_USER_NAME } from "@/lib/config";
import { formatLongDate } from "@/lib/format/date";
import { DIGEST_STATUS_LABELS, suggestedDigestAction, type DigestData } from "./get-digest-data";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CELL = "padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;";

/**
 * Tabla HTML básica (nada de flexbox/grid: los clientes de correo, sobre
 * todo Outlook de escritorio, no lo soportan) con el mismo contenido que la
 * página `/digest` — ver `getDigestData`.
 */
export function renderDigestEmailHtml(data: DigestData, timeZone: string): string {
  const rows = data.emails
    .map((email) => {
      const commitment = email.commitments[0];
      const latestDraft = email.drafts[0];
      const priorityCell = email.isUrgent
        ? `<span style="color:#b91c1c;font-weight:600;">Urgente &lt;48h</span>`
        : email.priorityScore.toFixed(2);
      const action = suggestedDigestAction({
        isUrgent: email.isUrgent,
        hasPendingDraft: latestDraft?.status === "PENDING_REVIEW",
        hasApprovedDraft: latestDraft?.status === "APPROVED",
        hasCommitment: !!commitment,
      });
      const vipBadge = email.sender.isVip
        ? ` <span style="color:#92400e;font-size:11px;font-weight:600;">VIP</span>`
        : "";

      return `<tr>
        <td style="${CELL}">${escapeHtml(email.sender.name)}${vipBadge}</td>
        <td style="${CELL}">${escapeHtml(email.subject)}</td>
        <td style="${CELL}white-space:nowrap;">${formatLongDate(email.receivedAt, timeZone)}</td>
        <td style="${CELL}">${priorityCell}</td>
        <td style="${CELL}">${escapeHtml(commitment?.description ?? "—")}</td>
        <td style="${CELL}">${DIGEST_STATUS_LABELS[email.status] ?? email.status}</td>
        <td style="${CELL}">${escapeHtml(action)}</td>
      </tr>`;
    })
    .join("");

  const vipSection =
    data.vipSendersUnanswered.length === 0
      ? `<p style="color:#6b7280;font-size:13px;">Todos los remitentes VIP tienen respuesta aprobada.</p>`
      : `<ul style="padding-left:18px;margin:8px 0;font-size:13px;">${data.vipSendersUnanswered
          .map((sender) => {
            const last = sender.emails[0];
            const lastInfo = last
              ? ` — último correo: ${escapeHtml(last.subject)} · ${formatLongDate(last.receivedAt, timeZone)}`
              : "";
            return `<li style="margin-bottom:4px;"><strong>${escapeHtml(sender.name)}</strong> (VIP)${lastInfo}</li>`;
          })
          .join("")}</ul>`;

  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:720px;">
  <h1 style="font-size:20px;margin:0 0 4px;">Informe de ${escapeHtml(CURRENT_USER_NAME)}</h1>
  <p style="color:#6b7280;font-size:13px;margin:0 0 16px;">
    ${formatLongDate(data.rangeStart, timeZone)} — ${formatLongDate(data.rangeEnd, timeZone)}
  </p>

  <table style="border-collapse:collapse;margin-bottom:20px;">
    <tr>
      <td style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 20px;">
        <div style="font-size:12px;color:#6b7280;">Compromisos activos</div>
        <div style="font-size:22px;font-weight:700;">${data.activeCommitments}</div>
      </td>
      <td style="width:12px;"></td>
      <td style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 20px;">
        <div style="font-size:12px;color:#6b7280;">Correos vencidos</div>
        <div style="font-size:22px;font-weight:700;color:#b91c1c;">${data.overdueCommitments}</div>
      </td>
    </tr>
  </table>

  <h2 style="font-size:16px;margin:0 0 8px;">Correos del periodo</h2>
  <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">
    <thead>
      <tr style="text-align:left;color:#6b7280;font-size:12px;">
        <th style="padding:6px 8px;">Remitente</th>
        <th style="padding:6px 8px;">Asunto</th>
        <th style="padding:6px 8px;">Recibido</th>
        <th style="padding:6px 8px;">Prioridad</th>
        <th style="padding:6px 8px;">Compromiso</th>
        <th style="padding:6px 8px;">Estado</th>
        <th style="padding:6px 8px;">Acción sugerida</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="7" style="padding:16px;text-align:center;color:#6b7280;font-size:13px;">No hay correos en este periodo.</td></tr>`}
    </tbody>
  </table>

  <h2 style="font-size:16px;margin:0 0 8px;">Remitentes VIP sin respuesta</h2>
  ${vipSection}
</div>`;
}

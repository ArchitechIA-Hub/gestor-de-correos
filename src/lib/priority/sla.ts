import { VIP_SLA_HOURS } from "./constants";

export type VipSlaStatus = "not_applicable" | "compliant" | "breached";

/**
 * Único punto de verdad para el estado de SLA de un remitente VIP (extra
 * "SLA de remitentes VIP"). No confundir con isUrgentByDeadline: aquella regla
 * es sobre vencimiento de compromisos, esta es sobre cuánto tarda el usuario
 * en responder a gente importante.
 */
export function computeVipSlaStatus(
  params: { isVip: boolean; receivedAt: Date; hasApprovedResponse: boolean },
  now: Date = new Date()
): VipSlaStatus {
  if (!params.isVip) return "not_applicable";
  if (params.hasApprovedResponse) return "compliant";

  const hoursSinceReceived = (now.getTime() - params.receivedAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceReceived > VIP_SLA_HOURS ? "breached" : "compliant";
}

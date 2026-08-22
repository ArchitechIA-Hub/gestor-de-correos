import { URGENT_THRESHOLD_HOURS, VIP_SCORE_WEIGHT, URGENCY_SCORE_WEIGHT } from "./constants";

/**
 * Único punto de verdad para la regla "urgencia por vencimiento <48h anula el
 * nivel activo". Se aplica siempre, sin importar el nivel de servicio calculado.
 */
export function isUrgentByDeadline(dueAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  const hoursRemaining = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursRemaining <= URGENT_THRESHOLD_HOURS;
}

export type PriorityInput = {
  id: string;
  receivedAt: Date;
  isVip: boolean;
  nearestDueAt: Date | null;
};

/**
 * Combina explícitamente dos señales: urgencia real (tiempo restante al
 * compromiso más próximo) e importancia del remitente (VIP). El orden
 * cronológico NUNCA es un fallback silencioso: solo se usa como último
 * criterio de desempate cuando el score y la urgencia son iguales.
 */
export function computePriorityScore(input: PriorityInput, now: Date = new Date()): number {
  const urgencyScore = urgencySignal(input.nearestDueAt, now);
  const vipScore = input.isVip ? 1 : 0;

  return urgencyScore * URGENCY_SCORE_WEIGHT + vipScore * VIP_SCORE_WEIGHT;
}

// Normaliza el tiempo restante a un score 0..1: sin compromiso -> 0,
// vencido o inminente -> 1, decayendo conforme el plazo se aleja.
function urgencySignal(dueAt: Date | null, now: Date): number {
  if (!dueAt) return 0;

  const hoursRemaining = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursRemaining <= 0) return 1;

  const DECAY_WINDOW_HOURS = 24 * 30; // un compromiso a 30+ días aporta ~0 urgencia
  return Math.max(0, 1 - hoursRemaining / DECAY_WINDOW_HOURS);
}

export type PrioritizedItem = PriorityInput & {
  priorityScore: number;
  isUrgent: boolean;
};

/**
 * Ordena por score de prioridad desc; el orden cronológico (receivedAt desc)
 * solo actúa como desempate final entre elementos de score idéntico.
 */
export function sortByPriority<T extends PrioritizedItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return b.receivedAt.getTime() - a.receivedAt.getTime();
  });
}

export function prioritize(inputs: PriorityInput[], now: Date = new Date()): PrioritizedItem[] {
  const scored = inputs.map((input) => ({
    ...input,
    priorityScore: computePriorityScore(input, now),
    isUrgent: isUrgentByDeadline(input.nearestDueAt, now),
  }));

  return sortByPriority(scored);
}

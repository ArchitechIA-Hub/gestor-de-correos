/**
 * Única fuente de verdad para los umbrales de negocio del motor de priorización.
 * Ningún otro módulo debe redefinir estos valores (regla de CLAUDE.md).
 */

export const URGENT_THRESHOLD_HOURS = 48;

export type ServiceLevelDefinition = {
  level: 1 | 2 | 3 | 4;
  name: string;
  backlogMin: number;
  backlogMax: number;
  scanFrequencyMinutes: number;
  features: {
    draftGeneration: boolean;
    urgentPushAlerts: boolean;
    rescueMode: boolean;
  };
};

// Decisión de producto temporal (2026-08-21, a pedido del usuario): mientras
// se valida el prototipo para vender, borradores/alertas/modo rescate están
// disponibles en TODOS los niveles, no solo desde el nivel que los "desbloquea"
// en el modelo de negocio documentado en CLAUDE.md. El nivel calculado y su
// frecuencia de escaneo se mantienen sin cambios — solo se desactiva el
// gating de funcionalidades por nivel. Para restaurar el escalonamiento
// original (borradores desde Nivel 2, alertas desde Nivel 3, rescate en
// Nivel 4), cambiar esta constante a false.
export const FEATURES_UNLOCKED_FOR_ALL_LEVELS = true;

const TIERED_FEATURES: Record<1 | 2 | 3 | 4, ServiceLevelDefinition["features"]> = {
  1: { draftGeneration: false, urgentPushAlerts: false, rescueMode: false },
  2: { draftGeneration: true, urgentPushAlerts: false, rescueMode: false },
  3: { draftGeneration: true, urgentPushAlerts: true, rescueMode: false },
  4: { draftGeneration: true, urgentPushAlerts: true, rescueMode: true },
};

const ALL_FEATURES_ON: ServiceLevelDefinition["features"] = {
  draftGeneration: true,
  urgentPushAlerts: true,
  rescueMode: true,
};

function featuresForLevel(level: 1 | 2 | 3 | 4): ServiceLevelDefinition["features"] {
  return FEATURES_UNLOCKED_FOR_ALL_LEVELS ? ALL_FEATURES_ON : TIERED_FEATURES[level];
}

// Cada nivel es superset del anterior: los features se acumulan hacia arriba
// (ver featuresForLevel — actualmente aplanado por FEATURES_UNLOCKED_FOR_ALL_LEVELS).
export const SERVICE_LEVEL_DEFINITIONS: ServiceLevelDefinition[] = [
  {
    level: 1,
    name: "Ligero",
    backlogMin: 0,
    backlogMax: 200,
    scanFrequencyMinutes: 360,
    features: featuresForLevel(1),
  },
  {
    level: 2,
    name: "Moderado",
    backlogMin: 201,
    backlogMax: 800,
    scanFrequencyMinutes: 120,
    features: featuresForLevel(2),
  },
  {
    level: 3,
    name: "Alto",
    backlogMin: 801,
    backlogMax: 2500,
    scanFrequencyMinutes: 30,
    features: featuresForLevel(3),
  },
  {
    level: 4,
    name: "Crítico",
    backlogMin: 2501,
    backlogMax: Infinity,
    scanFrequencyMinutes: 15,
    features: featuresForLevel(4),
  },
];

export const RESCUE_MODE_COMMITMENT_COUNT = 10;

// Número de extras activados a partir del cual se exige panel único consolidado.
export const EXTRAS_CONSOLIDATION_THRESHOLD = 3;

// Peso relativo de la señal de importancia del remitente (VIP) frente a la urgencia
// en el score combinado de priorización.
export const VIP_SCORE_WEIGHT = 0.4;
export const URGENCY_SCORE_WEIGHT = 0.6;

// Ventana de SLA de respuesta para remitentes VIP (extra "SLA de remitentes
// VIP"): horas desde la recepción sin una respuesta aprobada antes de
// marcarse como incumplido. Distinto del umbral de urgencia general
// (URGENT_THRESHOLD_HOURS) — ese es sobre vencimiento de compromisos, este es
// sobre latencia de respuesta a gente importante.
export const VIP_SLA_HOURS = 24;

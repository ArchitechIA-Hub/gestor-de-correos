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

// Cada nivel es superset del anterior: los features se acumulan hacia arriba.
export const SERVICE_LEVEL_DEFINITIONS: ServiceLevelDefinition[] = [
  {
    level: 1,
    name: "Ligero",
    backlogMin: 0,
    backlogMax: 200,
    scanFrequencyMinutes: 360,
    features: { draftGeneration: false, urgentPushAlerts: false, rescueMode: false },
  },
  {
    level: 2,
    name: "Moderado",
    backlogMin: 201,
    backlogMax: 800,
    scanFrequencyMinutes: 120,
    features: { draftGeneration: true, urgentPushAlerts: false, rescueMode: false },
  },
  {
    level: 3,
    name: "Alto",
    backlogMin: 801,
    backlogMax: 2500,
    scanFrequencyMinutes: 30,
    features: { draftGeneration: true, urgentPushAlerts: true, rescueMode: false },
  },
  {
    level: 4,
    name: "Crítico",
    backlogMin: 2501,
    backlogMax: Infinity,
    scanFrequencyMinutes: 15,
    features: { draftGeneration: true, urgentPushAlerts: true, rescueMode: true },
  },
];

export const RESCUE_MODE_COMMITMENT_COUNT = 10;

// Número de extras activados a partir del cual se exige panel único consolidado.
export const EXTRAS_CONSOLIDATION_THRESHOLD = 3;

// Peso relativo de la señal de importancia del remitente (VIP) frente a la urgencia
// en el score combinado de priorización.
export const VIP_SCORE_WEIGHT = 0.4;
export const URGENCY_SCORE_WEIGHT = 0.6;

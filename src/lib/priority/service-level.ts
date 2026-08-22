import { SERVICE_LEVEL_DEFINITIONS, type ServiceLevelDefinition } from "./constants";

/**
 * El nivel de servicio NUNCA es una elección del usuario: se recalcula
 * automáticamente a partir del backlog de correos sin clasificar.
 */
export function getServiceLevel(unclassifiedBacklogCount: number): ServiceLevelDefinition {
  const match = SERVICE_LEVEL_DEFINITIONS.find(
    (def) => unclassifiedBacklogCount >= def.backlogMin && unclassifiedBacklogCount <= def.backlogMax
  );

  // El último nivel cubre hasta Infinity, por lo que siempre hay match.
  return match ?? SERVICE_LEVEL_DEFINITIONS[SERVICE_LEVEL_DEFINITIONS.length - 1];
}

/**
 * Gmail aplica AND entre varios labelIds. INBOX + CATEGORY_PERSONAL = solo la
 * pestaña "Principal" (Primary): excluye Promociones / Social / Notificaciones /
 * Foros, que también llevan INBOX.
 */
export const PRIMARY_INBOX_LABEL_IDS = ["INBOX", "CATEGORY_PERSONAL"] as const;

/**
 * Cuántos correos recientes trae una importación. `DEFAULT` es el valor
 * precargado en la UI; el usuario puede pedir entre `MIN` y `MAX` (los 500
 * caben en una sola llamada a `messages.list`, sin paginación).
 */
export const DEFAULT_GMAIL_IMPORT_LIMIT = 50;
export const MIN_GMAIL_IMPORT_LIMIT = 1;
export const MAX_GMAIL_IMPORT_LIMIT = 500;

/**
 * Gmail aplica AND entre varios labelIds. INBOX + CATEGORY_PERSONAL = solo la
 * pestaña "Principal" (Primary): excluye Promociones / Social / Notificaciones /
 * Foros, que también llevan INBOX.
 */
export const PRIMARY_INBOX_LABEL_IDS = ["INBOX", "CATEGORY_PERSONAL"] as const;

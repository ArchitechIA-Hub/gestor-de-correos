/**
 * Gmail aplica AND entre varios labelIds, así que "Principal o Actualizaciones"
 * no se puede expresar como labelIds (ambas categorías son mutuamente
 * excluyentes por diseño de Gmail). Se usa como query de búsqueda (`q`) junto
 * con labelIds: ["INBOX"], que sí admite OR — así entran los correos
 * transaccionales/financieros (bancos, pasarelas de pago) que Gmail suele
 * clasificar como "Actualizaciones" en vez de "Principal", sin abrir la puerta
 * a Promociones / Social / Foros.
 */
export const PRIMARY_OR_UPDATES_QUERY = "category:primary OR category:updates";

/**
 * Cuántos correos recientes trae una importación. `DEFAULT` es el valor
 * precargado en la UI; el usuario puede pedir entre `MIN` y `MAX` (los 500
 * caben en una sola llamada a `messages.list`, sin paginación).
 */
export const DEFAULT_GMAIL_IMPORT_LIMIT = 50;
export const MIN_GMAIL_IMPORT_LIMIT = 1;
export const MAX_GMAIL_IMPORT_LIMIT = 500;

/**
 * Paginación del catch-up automático (`importNewGmailEmails`): tamaño de
 * página al listar mensajes y tope de páginas como circuito de seguridad
 * (no un límite de costo — ver comentario en el import automático).
 */
export const CATCH_UP_PAGE_SIZE = 100;
export const CATCH_UP_MAX_PAGES = 50;

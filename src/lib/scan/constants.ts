/**
 * Tope de correos que un ciclo de `scan()` procesa por lote. Es un límite
 * operativo (coste y latencia de las llamadas secuenciales a la IA), NO un
 * umbral de negocio — por eso no vive en `src/lib/priority/constants.ts`.
 *
 * El usuario puede pedir menos desde la UI (campo editable en los botones de
 * escaneo); nunca más de este tope. También es el valor por defecto cuando no
 * se pide una cantidad concreta (p. ej. el scheduler automático).
 *
 * Va en su propio archivo porque `scan.ts` es `"use server"` y un módulo con
 * esa directiva solo puede exportar funciones async, no constantes.
 */
export const SCAN_BATCH_SIZE = 50;
export const MIN_SCAN_BATCH_SIZE = 1;

/**
 * Categoría temática de un correo (`Email.category`, `Sender.autoCategory`).
 * Por ahora solo existe "FINANZAS": correos de bancos / pagos que viven en su
 * propia vista de la bandeja en vez de mezclarse con "Priorizados".
 */
export const EMAIL_CATEGORY_FINANZAS = "FINANZAS";


/**
 * Correos que un ciclo de `scan()` procesa por lote. Es un límite operativo
 * (coste y latencia de las llamadas secuenciales a la IA), NO un umbral de
 * negocio — por eso no vive en `src/lib/priority/constants.ts`.
 *
 * Va en su propio archivo porque `scan.ts` es `"use server"` y un módulo con
 * esa directiva solo puede exportar funciones async, no constantes.
 */
export const SCAN_BATCH_SIZE = 20;

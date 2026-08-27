# Notas: manejo de backlogs grandes (validación real)

Contexto: validación con una persona real que tiene hasta 7800 mensajes sin leer en una cuenta, y otras cuentas con 4500 y 3000 sin leer (las 3 cuentas de la misma persona — el escenario que motivó el feature de multi-cuenta). Este documento resume el análisis hecho, sin implementación todavía — para retomar y decidir qué construir.

## Qué funciona hoy sin cambios

- El nivel de servicio se calcula correctamente sobre el backlog **global** (todas las cuentas sumadas): `getCurrentServiceLevel` en `src/lib/priority/current.ts` cuenta `Email` con `status: "UNCLASSIFIED"` sin filtrar por cuenta. Con 7800 en una cuenta, o con 7800+4500+3000 = 15300 repartidos en tres, el resultado es el mismo: Nivel 4 — Crítico (umbral >2500 en `src/lib/priority/constants.ts`). No hay razón para tener un nivel distinto por cuenta; esa decisión (backlog global, no por cuenta) ya se tomó deliberadamente al construir multi-cuenta.

## Gaps identificados para este volumen

1. **Escaneo 100% manual, sin scheduler real.** El único disparador es el botón "Escanear siguiente lote" (`src/components/inbox/scan-button.tsx` → `src/app/actions/scan.ts`), que procesa 8 correos por click. La frecuencia "cada 15 min" que Nivel 4 documenta (`constants.ts`) es solo una etiqueta en la UI — no hay ningún cron/job real detrás. Con miles de correos, vaciar el backlog a mano es inviable.

2. **Sin rotación entre cuentas al escanear.** `scan()` toma los correos `UNCLASSIFIED` en orden estrictamente global por `receivedAt` ascendente (el más antiguo primero), sin ninguna cuota por cuenta. Si la cuenta de 7800 tiene los correos más viejos, el escaneo (manual o, si se automatiza, también automático) le dedicaría el 100% de su atención hasta vaciarla, dejando las cuentas de 4500 y 3000 completamente sin tocar mientras tanto. El usuario vería esas dos pestañas de `/inbox` vacías por mucho tiempo aunque el sistema esté "funcionando". Si se automatiza el escaneo, hay que decidir si debe repartirse el trabajo entre cuentas (p. ej. round-robin o cupo proporcional) en vez de vaciar una cuenta a la vez.

3. **Modo rescate (Nivel 4) no está construido.** CLAUDE.md documenta que Nivel 4 incluye un "plan de choque" con los 10 compromisos más urgentes. Solo existe la constante `RESCUE_MODE_COMMITMENT_COUNT` en `constants.ts`; no hay vista ni lógica todavía. Es justamente el tipo de ayuda inmediata que alguien con 15300 correos sin leer necesitaría mientras el resto del backlog se procesa.

4. **El digest no tiene límite (`take`).** La query principal de `src/app/(dashboard)/digest/page.tsx` (`prisma.email.findMany`) no pagina — con miles de correos ya clasificados, intentaría traer y renderizar todas las filas del periodo de una sola vez.

## Pendiente de decidir

Ninguno de estos puntos se ha implementado. Cuando se retome, decidir cuál(es) priorizar — probablemente en este orden de impacto para un caso como el de 15300 correos repartidos en 3 cuentas: (1) automatizar el escaneo con alguna forma de rotación entre cuentas, (2) modo rescate, (3) paginar el digest.

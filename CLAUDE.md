# CLAUDE.md

Guía de contexto para trabajar en este proyecto con Claude Code.

## Estado del proyecto

Repositorio vacío, en fase de diseño previa a la implementación. Este archivo documenta la especificación funcional acordada para que cualquier trabajo de código futuro (arquitectura, modelos de datos, endpoints, UI) sea consistente con las reglas de negocio definidas aquí. No asumas stack tecnológico: no ha sido decidido todavía.

## Qué es este producto

Gestor de correo electrónico con IA dirigido a personas con bandejas de entrada saturadas que, por falta de tiempo, terminan incumpliendo compromisos importantes (fechas límite, promesas hechas por email, etc.). El sistema lee el correo, detecta compromisos, prioriza por urgencia real (no por orden cronológico) y ayuda a responder sin que el usuario tenga que leer todo el backlog.

## Niveles de servicio (auto-calculados)

El nivel de servicio **no es una elección del usuario**: se recalcula automáticamente según el volumen de correos sin clasificar (backlog). Cualquier lógica de scheduling o notificaciones debe derivarse de este backlog, nunca de una configuración estática.

| Nivel | Backlog sin clasificar | Frecuencia de escaneo | Incluye |
|---|---|---|---|
| 1 — Ligero | Hasta 200 | Cada 6 horas | — |
| 2 — Moderado | 201–800 | Cada 2 horas | Borradores de respuesta |
| 3 — Alto | 801–2,500 | Cada 30 minutos | + Alertas push de compromisos urgentes |
| 4 — Crítico | Más de 2,500 | Cada 15 minutos | + Modo "rescate": plan de choque con los 10 compromisos más urgentes |

Cada nivel es superset del anterior (moderado incluye lo de ligero, alto incluye lo de moderado, etc.).

## Funcionalidad principal

1. **Detección de compromisos y fechas límite** en el contenido de los correos (texto libre del hilo, no solo campos estructurados).
2. **Clasificación y priorización automática** por urgencia real + importancia del remitente — nunca por orden cronológico simple.
3. **Resumen periódico (digest)** diario o semanal — ver formato exacto más abajo.
4. **Generación de borradores de respuesta** según el contexto del hilo (disponible desde el Nivel 2 en adelante).

## Extras opcionales (activables por el usuario)

- Integración con calendario (Google Calendar/Outlook): crea eventos automáticamente a partir de compromisos detectados.
- Integración con WhatsApp: notificaciones push de correos críticos.
- Borradores automáticos de respuesta con el tono habitual del usuario.
- Detección de remitentes VIP con SLA de respuesta prioritaria.
- Panel de analytics: tiempo de respuesta promedio, correos pendientes por antigüedad, % de compromisos cumplidos a tiempo.

## Reglas de negocio (invariantes — no romper)

- **Nunca se envía una respuesta sin aprobación humana explícita.** El sistema genera borradores; no despacha correos por sí mismo, en ningún nivel de servicio.
- **Urgencia por vencimiento < 48h anula el nivel activo:** todo compromiso con vencimiento en menos de 48 horas se marca urgente y dispara notificación inmediata, sin importar el nivel de servicio calculado (incluso en Nivel 1).
- **Consolidación de extras:** si el usuario tiene 3 o más extras activados, el sistema debe unificar todo en un panel único en vez de mandar notificaciones separadas por canal.
- **Los remitentes VIP siempre se priorizan** sobre el orden cronológico normal, en cualquier nivel de servicio.
- **Auditoría de acciones automáticas:** toda acción que el sistema tome de forma automática (clasificar, marcar urgente, crear evento de calendario, generar borrador, etc.) debe quedar en un log auditable, visible y reversible por el usuario.

## Formato del digest / reporte

El digest (diario o semanal) debe incluir siempre:

- Nombre del usuario y rango de fechas cubierto.
- Tabla desglosada de correos con columnas: remitente, asunto, fecha de recepción, prioridad, compromiso detectado, estado, acción sugerida.
- Resumen numérico de compromisos activos y correos vencidos.
- Sección aparte de remitentes VIP sin respuesta.

## Al implementar

- Cualquier motor de priorización debe combinar explícitamente dos señales: urgencia real (derivada de fechas/compromisos detectados) e importancia del remitente (VIP u otro). No implementar ordenamiento puramente cronológico como fallback silencioso.
- El cálculo del nivel de servicio y la lógica de "urgente <48h" deben vivir en un solo lugar (no duplicar el umbral en varios componentes) para evitar que diverjan.
- Cualquier acción irreversible (enviar correo, borrar, modificar calendario de terceros) requiere confirmación humana antes de ejecutarse — el log auditable no sustituye la aprobación previa, la complementa.

## Actualización constante de memoria

Mantén la memoria persistente al día durante todo el trabajo en este proyecto, no solo cuando el usuario lo pida explícitamente:

- Cada vez que se acuerde, cambie o matice una regla de negocio, un invariante o un dato de la especificación funcional (niveles de servicio, umbrales, formato del digest, extras, etc.), guárdalo o actualízalo en memoria (tipo `project`) de inmediato, no al final de la sesión.
- Si el usuario corrige un enfoque o confirma que uno fue el correcto, guárdalo como memoria de tipo `feedback` en el momento en que ocurre.
- Antes de dar por buena una recomendación basada en una memoria existente, verifica que siga vigente contra el estado actual de este archivo y del código; si diverge, actualiza o elimina la memoria obsoleta en vez de actuar sobre ella.
- No dupliques en memoria lo que ya está documentado en este CLAUDE.md — solo guarda contexto adicional (decisiones, motivos, cambios de alcance) que no sea derivable de este archivo.

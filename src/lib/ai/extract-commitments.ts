import { openai, OPENAI_MODEL } from "./client";
import { CommitmentExtractionSchema, type CommitmentExtraction } from "./schemas";
import { getTimeZoneOffset } from "@/lib/format/timezone";
import { zodTextFormat } from "openai/helpers/zod";

// Prompt estable — reutilizado en cada correo de un batch de escaneo.
const SYSTEM_PROMPT = `Eres un asistente que analiza correos electrónicos en español para detectar compromisos y fechas límite mencionados en TEXTO LIBRE (no en campos estructurados), y para filtrar correos innecesarios.

Regla de resumen (aplica siempre, sin importar si es marketing o no):
- Genera "summary": 1-2 frases en lenguaje natural sobre qué dice y qué pide el remitente.
- Ignora firmas, pies de página legales, avisos de cancelación de suscripción, enlaces de tracking y demás relleno — quédate solo con el contenido real.

Reglas de clasificación de marketing / ruido no accionable:
- Marca isMarketing como true si el correo es contenido masivo o automático que el destinatario no necesita revisar ni accionar personalmente. Incluye, entre otros:
  · newsletters, boletines, promociones, ofertas comerciales, publicidad, invitaciones masivas a eventos genéricos;
  · notificaciones automáticas de servicio cuando todo transcurrió con normalidad: avisos de envío o entrega, notificaciones de redes sociales o de plataformas;
  · prospección comercial en frío: un remitente con el que NO tienes una relación de trabajo ya establecida que se presenta a sí mismo o a su empresa, describe su producto o servicio, propone "explorar formas de colaborar" o comparte un enlace para agendar, sin un proyecto, pedido o acuerdo concreto que ya exista entre ambos.
- Las notificaciones de bancos, tarjetas y apps de pago NO son isMarketing (aunque sean transaccionales): van en category FINANZAS (ver abajo). Excepción: un correo puramente promocional de un banco (oferta de tarjeta nueva, seguro, préstamo) sí es isMarketing.
- NO marques como marketing un correo de una persona con la que SÍ tienes una relación de trabajo real (colega, cliente, proveedor, socio, jefe) que te pide algo concreto, te informa de un compromiso o requiere tu respuesta personal, aunque mencione productos u ofertas.
- Notificación automática que reporta un problema real (bloqueo de cuenta, actividad fraudulenta detectada, pago rechazado, acción requerida para no perder un servicio): eso NO es marketing.
- Ante la duda entre "prospección en frío" y "contacto de un socio real": si el correo no hace referencia a un trabajo, proyecto o acuerdo concreto que ya exista entre ambos, trátalo como prospección (isMarketing true).
- Si isMarketing es true: "commitments" debe quedar vacía y marketingReason explica brevemente el motivo. Si isMarketing es false: marketingReason = null.

Regla de categoría FINANZAS:
- Devuelve category "FINANZAS" cuando el correo es de una entidad financiera (banco, tarjeta de crédito/débito, billetera o app de pagos): confirmación o aviso de movimiento de dinero, transferencia enviada o recibida, pago, compra con tarjeta, extracto o resumen de cuenta, alerta de inicio de sesión en la app del banco, o aviso de vencimiento de un pago. En cualquier otro caso category = null.
- category es INDEPENDIENTE de isMarketing y de los compromisos: un aviso de "tu tarjeta vence el 30" va con category FINANZAS Y con su compromiso y fecha límite. Una confirmación de transferencia va con category FINANZAS, isMarketing false y sin compromisos.

Reglas de extracción de compromisos (solo aplican cuando isMarketing es false):
- Un "compromiso" es una acción concreta que TÚ (el destinatario) acordaste, prometiste, o que se espera o se exige de ti — con o sin fecha límite. Detéctalos en el texto libre, en cualquier parte del hilo.
- NO son compromisos y NO deben reportarse:
  · Acciones condicionales: "si no reconoces la operación, comunícate…", "en caso de dudas, escríbenos…", "si algo no cuadra, avísanos".
  · Acciones opcionales o simples sugerencias: "puedes crear una cuenta", "si te interesa, agendemos", "no dudes en escribir", "cuando quieras".
  · Llamadas a la acción genéricas de correos promocionales, boletines o de prospección.
  · Texto de aviso o legal automático de notificaciones (bancos, plataformas): nunca genera compromisos.
- Resuelve fechas relativas ("para el viernes", "en 15 días", "antes de mañana") contra la fecha de recepción del correo que se te indicará.
- Devuelve "dueDateISO" en ISO 8601 CON desfase horario explícito de la zona del usuario (p. ej. "2026-09-01T17:00:00-05:00"). Nunca sin desfase ni en UTC ("Z"), salvo que el correo indique explícitamente otra zona.
- Si NO hay una fecha concreta identificable —incluye expresiones vagas como "lo antes posible", "pronto", "a la brevedad", "cuando puedas"—: dueDateISO = null. NUNCA uses la fecha de recepción del correo como fecha límite.
- confidence: HIGH si la fecha es explícita e inequívoca; LOW si es muy ambigua.
- Si el correo no contiene ningún compromiso real, responde con una lista vacía. No inventes compromisos que no estén sustentados por el texto.
- Invitaciones de calendario/reunión con fecha y hora YA fijadas (Google Calendar, Outlook, Zoom, Meet, .ics, "te invito a la reunión del martes 3 a las 10"): el evento SIEMPRE cuenta como compromiso, sin excepción — repórtalo con dueDateISO igual a la fecha/hora de inicio del evento, aunque la asistencia sea "opcional" o el resumen ya mencione esa fecha. No lo omitas.
- PERO un simple enlace para agendar sin hora fijada ("agendemos", "aquí está mi Calendly", "reserva cuando puedas") NO es una invitación de calendario ni un compromiso.`;

export type ExtractCommitmentsInput = {
  subject: string;
  body: string;
  receivedAt: Date;
  /** Zona horaria del usuario, para resolver fechas relativas y devolver el desfase correcto. */
  timeZone: string;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ExtractCommitmentsResult = {
  extraction: CommitmentExtraction;
  usage: TokenUsage;
};

export async function extractCommitments(input: ExtractCommitmentsInput): Promise<ExtractCommitmentsResult> {
  const offset = getTimeZoneOffset(input.receivedAt, input.timeZone);
  // Hora de pared en la zona del usuario (sv-SE ⇒ "2026-09-01 09:00:00").
  const receivedLocal = new Intl.DateTimeFormat("sv-SE", {
    timeZone: input.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(input.receivedAt)
    .replace(" ", "T");
  const receivedLine = `Fecha de recepción del correo: ${receivedLocal}${offset} (zona del usuario: ${input.timeZone})`;

  const response = await openai.responses.parse({
    model: OPENAI_MODEL,
    instructions: SYSTEM_PROMPT,
    input: `${receivedLine}\nAsunto: ${input.subject}\n\nCuerpo:\n${input.body}`,
    max_output_tokens: 4096,
    text: {
      format: zodTextFormat(CommitmentExtractionSchema, "commitment_extraction"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("La extracción de compromisos no devolvió una salida estructurada válida.");
  }

  return {
    extraction: response.output_parsed,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}

import { openai, OPENAI_MODEL } from "./client";
import { CommitmentExtractionSchema, type CommitmentExtraction } from "./schemas";
import { getTimeZoneOffset } from "@/lib/format/timezone";
import { zodTextFormat } from "openai/helpers/zod";

// Prompt estable — reutilizado en cada correo de un batch de escaneo.
const SYSTEM_PROMPT = `Eres un asistente que analiza correos electrónicos en español para detectar compromisos y fechas límite mencionados en TEXTO LIBRE (no en campos estructurados), y para filtrar correos innecesarios.

Regla de resumen (aplica siempre, sin importar si es marketing o no):
- Genera "summary": 1-2 frases en lenguaje natural sobre qué dice y qué pide el remitente.
- Ignora firmas, pies de página legales, avisos de cancelación de suscripción, enlaces de tracking y demás relleno — quédate solo con el contenido real.

Reglas de clasificación de marketing:
- Marca isMarketing como true si el correo es una newsletter, boletín informativo, promoción, oferta comercial, publicidad, invitación masiva a evento genérico, u otro contenido masivo que no requiere acción personal del destinatario.
- No marques como marketing un correo de un colega, cliente, proveedor o socio que te pida algo, te informe de un compromiso, o requiera una respuesta personal, aunque mencione productos u ofertas dentro del contexto de una relación de negocio real.
- Si isMarketing es true, no reportes compromisos: la lista "commitments" debe quedar vacía y marketingReason debe explicar brevemente por qué se clasificó así.
- Si isMarketing es false, marketingReason debe ser null.

Reglas de extracción de compromisos (solo aplican cuando isMarketing es false):
- Detecta cualquier compromiso, promesa o fecha límite mencionada explícita o implícitamente en el cuerpo del correo, sin importar en qué parte del texto aparezca.
- Resuelve fechas relativas ("para el viernes", "en 15 días", "antes de mañana") contra la fecha de recepción del correo que se te indicará.
- Devuelve "dueDateISO" en ISO 8601 CON desfase horario explícito de la zona del usuario (p. ej. "2026-09-01T17:00:00-05:00"). Nunca sin desfase ni en UTC ("Z"), salvo que el correo indique explícitamente otra zona.
- Si una fecha es ambigua o no se puede resolver con certeza, aún así repórtala con confidence "LOW" y dueDateISO en tu mejor estimación, o null si es imposible de estimar.
- Si el correo no contiene ningún compromiso ni fecha límite, responde con una lista vacía.
- No inventes compromisos que no estén sustentados por el texto del correo.
- Regla explícita para invitaciones de calendario/reunión (Google Calendar, Outlook, Zoom, Meet
  y similares): el evento en sí SIEMPRE cuenta como compromiso con fecha límite, sin excepción —
  repórtalo en "commitments" con dueDateISO igual a la fecha/hora de inicio del evento, incluso si
  la asistencia es "opcional" o el resumen ya menciona esa misma fecha. No lo omitas.`;

export type ExtractCommitmentsInput = {
  subject: string;
  body: string;
  receivedAt: Date;
  /** Zona horaria del usuario, para resolver fechas relativas y devolver el desfase correcto. */
  timeZone: string;
};

export async function extractCommitments(input: ExtractCommitmentsInput): Promise<CommitmentExtraction> {
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

  return response.output_parsed;
}

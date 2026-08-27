import { openai, OPENAI_MODEL } from "./client";
import { CommitmentExtractionSchema, type CommitmentExtraction } from "./schemas";
import { zodTextFormat } from "openai/helpers/zod";

// Prompt estable — reutilizado en cada correo de un batch de escaneo.
const SYSTEM_PROMPT = `Eres un asistente que analiza correos electrónicos en español para detectar compromisos y fechas límite mencionados en TEXTO LIBRE (no en campos estructurados), y para filtrar correos innecesarios.

Reglas de clasificación de marketing:
- Marca isMarketing como true si el correo es una newsletter, boletín informativo, promoción, oferta comercial, publicidad, invitación masiva a evento genérico, u otro contenido masivo que no requiere acción personal del destinatario.
- No marques como marketing un correo de un colega, cliente, proveedor o socio que te pida algo, te informe de un compromiso, o requiera una respuesta personal, aunque mencione productos u ofertas dentro del contexto de una relación de negocio real.
- Si isMarketing es true, no reportes compromisos: la lista "commitments" debe quedar vacía y marketingReason debe explicar brevemente por qué se clasificó así.
- Si isMarketing es false, marketingReason debe ser null.

Reglas de extracción de compromisos (solo aplican cuando isMarketing es false):
- Detecta cualquier compromiso, promesa o fecha límite mencionada explícita o implícitamente en el cuerpo del correo, sin importar en qué parte del texto aparezca.
- Resuelve fechas relativas ("para el viernes", "en 15 días", "antes de mañana") contra la fecha de recepción del correo que se te indicará.
- Si una fecha es ambigua o no se puede resolver con certeza, aún así repórtala con confidence "LOW" y dueDateISO en tu mejor estimación, o null si es imposible de estimar.
- Si el correo no contiene ningún compromiso ni fecha límite, responde con una lista vacía.
- No inventes compromisos que no estén sustentados por el texto del correo.`;

export type ExtractCommitmentsInput = {
  subject: string;
  body: string;
  receivedAt: Date;
};

export async function extractCommitments(input: ExtractCommitmentsInput): Promise<CommitmentExtraction> {
  const response = await openai.responses.parse({
    model: OPENAI_MODEL,
    instructions: SYSTEM_PROMPT,
    input: `Fecha de recepción del correo: ${input.receivedAt.toISOString()}\nAsunto: ${input.subject}\n\nCuerpo:\n${input.body}`,
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

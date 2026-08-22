import { anthropic, CLAUDE_MODEL } from "./client";
import { CommitmentExtractionSchema, type CommitmentExtraction } from "./schemas";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// Prompt estable y cacheable (cache_control) — reutilizado en cada correo de
// un batch de escaneo para reducir costo en Niveles 3/4.
const SYSTEM_PROMPT = `Eres un asistente que analiza correos electrónicos en español para detectar compromisos y fechas límite mencionados en TEXTO LIBRE (no en campos estructurados).

Reglas:
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
  const response = await anthropic.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Fecha de recepción del correo: ${input.receivedAt.toISOString()}\nAsunto: ${input.subject}\n\nCuerpo:\n${input.body}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(CommitmentExtractionSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("La extracción de compromisos no devolvió una salida estructurada válida.");
  }

  return response.parsed_output;
}

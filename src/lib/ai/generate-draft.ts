import { openai, OPENAI_MODEL } from "./client";
import { CURRENT_USER_NAME } from "@/lib/config";
import type { DraftResponseType } from "@/generated/prisma/enums";

export type GenerateDraftInput = {
  senderName: string;
  subject: string;
  body: string;
  commitmentDescriptions: string[];
  tone?: string;
  responseType: DraftResponseType;
};

const RESPONSE_TYPE_INSTRUCTIONS: Record<DraftResponseType, string> = {
  AFFIRMATIVE:
    "Redacta una respuesta AFIRMATIVA: acepta o sigue la línea de lo que se pide en el correo, confirmando explícitamente el o los compromisos detectados.",
  NEGATIVE:
    "Redacta una respuesta NEGATIVA: declina o rechaza lo que se pide, explicando brevemente el motivo sin ser cortante. No confirmes los compromisos detectados.",
  INTERMEDIATE:
    "Redacta una respuesta INTERMEDIA: ni aceptas ni rechazas de forma directa — propone una alternativa, condiciona la aceptación, pide más información o plazo, o ofrece un término medio.",
};

/**
 * Genera un borrador de respuesta contextual. El resultado SIEMPRE queda en
 * estado pending_review — no existe en el prototipo ninguna acción que envíe
 * el correo; solo aprobación humana explícita puede marcarlo approved.
 */
export async function generateDraft(input: GenerateDraftInput): Promise<string> {
  const toneInstruction = input.tone
    ? `Escribe con este tono/estilo habitual del usuario: ${input.tone}.`
    : "Escribe en un tono profesional, cordial y directo.";

  const commitmentsList = input.commitmentDescriptions.length
    ? `Compromisos detectados en este hilo que la respuesta debería abordar:\n${input.commitmentDescriptions
        .map((c) => `- ${c}`)
        .join("\n")}`
    : "No se detectaron compromisos específicos en este hilo.";

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    instructions:
      "Eres un asistente que redacta borradores de respuesta de correo en español para un ejecutivo con poco tiempo. " +
      "El borrador es SOLO una propuesta que el usuario revisará y aprobará manualmente antes de enviarse — nunca se envía automáticamente. " +
      `Firma como ${CURRENT_USER_NAME}. ` +
      "Responde ÚNICAMENTE con el cuerpo del correo en texto plano: sin encabezado de asunto, sin markdown (nada de **, #, -, etc.), sin placeholders entre corchetes. " +
      toneInstruction +
      " " +
      RESPONSE_TYPE_INSTRUCTIONS[input.responseType],
    input: `Correo original de ${input.senderName}\nAsunto: ${input.subject}\n\n${input.body}\n\n${commitmentsList}\n\nRedacta el cuerpo de una respuesta breve y concreta.`,
    max_output_tokens: 1024,
  });

  if (!response.output_text) {
    throw new Error("La generación de borrador no devolvió texto.");
  }

  return response.output_text;
}

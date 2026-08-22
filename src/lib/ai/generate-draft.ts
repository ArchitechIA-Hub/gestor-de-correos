import { anthropic, CLAUDE_MODEL } from "./client";

export type GenerateDraftInput = {
  senderName: string;
  subject: string;
  body: string;
  commitmentDescriptions: string[];
  tone?: string;
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

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system:
      "Eres un asistente que redacta borradores de respuesta de correo en español para un ejecutivo con poco tiempo. " +
      "El borrador es SOLO una propuesta que el usuario revisará y aprobará manualmente antes de enviarse — nunca se envía automáticamente. " +
      toneInstruction,
    messages: [
      {
        role: "user",
        content: `Correo original de ${input.senderName}\nAsunto: ${input.subject}\n\n${input.body}\n\n${commitmentsList}\n\nRedacta un borrador de respuesta breve y concreto.`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("La generación de borrador no devolvió texto.");
  }

  return textBlock.text;
}

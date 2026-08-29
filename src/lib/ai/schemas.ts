import { z } from "zod";

export const CommitmentExtractionSchema = z.object({
  summary: z
    .string()
    .describe(
      "Resumen de 1-2 frases en español del contenido real del correo, en lenguaje natural — ignora firmas, pies de página legales, enlaces de tracking/cancelación de suscripción y demás relleno; enfócate en qué dice y qué pide el remitente"
    ),
  isMarketing: z
    .boolean()
    .describe(
      "true si el correo es marketing, newsletter, promoción, boletín u otro contenido masivo no accionable que el usuario no necesita revisar"
    ),
  marketingReason: z
    .string()
    .nullable()
    .describe("Motivo breve de la clasificación de marketing, o null si isMarketing es false"),
  commitments: z.array(
    z.object({
      description: z.string().describe("Descripción breve y accionable del compromiso detectado"),
      dueDateISO: z
        .string()
        .nullable()
        .describe("Fecha límite resuelta en formato ISO 8601, o null si no hay fecha identificable"),
      isExplicitDate: z
        .boolean()
        .describe("true si el correo menciona una fecha explícita; false si se infirió de lenguaje relativo"),
      confidence: z
        .enum(["LOW", "MEDIUM", "HIGH"])
        .describe("Confianza en la fecha resuelta: HIGH si es explícita e inequívoca, LOW si es muy ambigua"),
      sourceExcerpt: z.string().describe("Fragmento textual del correo que sustenta este compromiso"),
    })
  ),
});

export type CommitmentExtraction = z.infer<typeof CommitmentExtractionSchema>;

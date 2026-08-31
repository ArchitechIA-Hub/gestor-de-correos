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
      "true si el correo es contenido masivo o automático no accionable que el usuario no necesita revisar: marketing, newsletter, promoción, boletín, invitación masiva, aviso de envío/entrega, notificación de red social, o prospección comercial en frío sin relación de trabajo previa. NO uses isMarketing para notificaciones de bancos/pagos: esas van en category FINANZAS"
    ),
  marketingReason: z
    .string()
    .nullable()
    .describe("Motivo breve de la clasificación de marketing, o null si isMarketing es false"),
  category: z
    .enum(["FINANZAS"])
    .nullable()
    .describe(
      "\"FINANZAS\" si el correo es de una entidad financiera (banco, tarjeta, billetera/app de pagos): confirmación o aviso de movimiento de dinero, transferencia, pago, compra con tarjeta, extracto, alerta de inicio de sesión en la app del banco, o vencimiento de un pago. En cualquier otro caso null. Es independiente de isMarketing y de los compromisos."
    ),
  commitments: z.array(
    z.object({
      description: z
        .string()
        .describe(
          "Descripción breve y accionable de algo que el destinatario acordó, prometió o se espera/exige de él — no acciones condicionales, opcionales ni CTAs genéricas"
        ),
      dueDateISO: z
        .string()
        .nullable()
        .describe(
          "Fecha límite resuelta en ISO 8601 con desfase horario, o null si no hay una fecha concreta (incluye 'lo antes posible', 'pronto', 'cuando puedas'). Nunca uses la fecha de recepción como fecha límite."
        ),
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

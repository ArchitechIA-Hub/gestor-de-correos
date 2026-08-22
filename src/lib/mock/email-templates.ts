export type MockCommitment = {
  description: string;
  dueAt: Date | null;
  sourceExcerpt: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
};

export type MockEmailTemplate = {
  subject: string;
  body: string;
  commitments: MockCommitment[];
};

export type TemplateCategory =
  | "OVERDUE"
  | "URGENT_48H"
  | "THIS_WEEK"
  | "NEXT_MONTH"
  | "NO_COMMITMENT"
  | "MULTIPLE";

function hoursFrom(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Genera un correo de ejemplo con compromisos incrustados en texto libre
 * (no en campos estructurados), tal como los recibiría el usuario real.
 * `now` es el instante de referencia contra el que se calculan los plazos.
 */
export function buildEmailBody(category: TemplateCategory, senderName: string, now: Date): MockEmailTemplate {
  switch (category) {
    case "OVERDUE":
      return {
        subject: "Seguimiento pendiente — sin respuesta",
        body: `Hola,\n\nTe escribí hace unos días sobre el informe que necesitábamos cerrar. Habíamos quedado en tenerlo listo para el ${formatDate(hoursFrom(now, -30))}, pero no he recibido nada todavía. ¿Podemos resolverlo hoy mismo?\n\nSaludos,\n${senderName}`,
        commitments: [
          {
            description: "Entregar el informe acordado",
            dueAt: hoursFrom(now, -30),
            sourceExcerpt: `Habíamos quedado en tenerlo listo para el ${formatDate(hoursFrom(now, -30))}`,
            confidence: "HIGH",
          },
        ],
      };
    case "URGENT_48H":
      return {
        subject: "Necesito tu confirmación antes de mañana",
        body: `Hola,\n\nEstamos por cerrar el trimestre y necesito tu aprobación sobre la propuesta antes de mañana a primera hora, o perdemos la ventana con el proveedor.\n\n¿Puedes confirmarme hoy?\n\nGracias,\n${senderName}`,
        commitments: [
          {
            description: "Aprobar la propuesta antes de la fecha límite",
            dueAt: hoursFrom(now, 20),
            sourceExcerpt: "necesito tu aprobación sobre la propuesta antes de mañana a primera hora",
            confidence: "HIGH",
          },
        ],
      };
    case "THIS_WEEK":
      return {
        subject: "Reunión y entregable de esta semana",
        body: `Hola,\n\n¿Podemos tener la revisión lista para el ${formatDate(hoursFrom(now, 96))}? Me gustaria presentarla en el comité del viernes.\n\nSaludos,\n${senderName}`,
        commitments: [
          {
            description: "Tener la revisión lista para el comité",
            dueAt: hoursFrom(now, 96),
            sourceExcerpt: `¿Podemos tener la revisión lista para el ${formatDate(hoursFrom(now, 96))}?`,
            confidence: "MEDIUM",
          },
        ],
      };
    case "NEXT_MONTH":
      return {
        subject: "Planificación del próximo trimestre",
        body: `Hola,\n\nQueria adelantarte que para el ${formatDate(hoursFrom(now, 24 * 28))} deberíamos tener definido el plan del próximo trimestre. No hay apuro, pero quería dejarlo agendado.\n\nSaludos,\n${senderName}`,
        commitments: [
          {
            description: "Definir el plan del próximo trimestre",
            dueAt: hoursFrom(now, 24 * 28),
            sourceExcerpt: `para el ${formatDate(hoursFrom(now, 24 * 28))} deberíamos tener definido el plan`,
            confidence: "MEDIUM",
          },
        ],
      };
    case "MULTIPLE":
      return {
        subject: "Varios pendientes de nuestra última llamada",
        body: `Hola,\n\nResumiendo lo que quedó de la llamada: primero, necesito que me confirmes el presupuesto antes del ${formatDate(hoursFrom(now, 40))}. Segundo, quedamos en enviar el contrato firmado para el ${formatDate(hoursFrom(now, 24 * 10))}. Por último, sería bueno agendar una revisión general para dentro de un mes.\n\nGracias,\n${senderName}`,
        commitments: [
          {
            description: "Confirmar el presupuesto",
            dueAt: hoursFrom(now, 40),
            sourceExcerpt: `necesito que me confirmes el presupuesto antes del ${formatDate(hoursFrom(now, 40))}`,
            confidence: "HIGH",
          },
          {
            description: "Enviar el contrato firmado",
            dueAt: hoursFrom(now, 24 * 10),
            sourceExcerpt: `quedamos en enviar el contrato firmado para el ${formatDate(hoursFrom(now, 24 * 10))}`,
            confidence: "HIGH",
          },
          {
            description: "Agendar revisión general",
            dueAt: hoursFrom(now, 24 * 30),
            sourceExcerpt: "sería bueno agendar una revisión general para dentro de un mes",
            confidence: "LOW",
          },
        ],
      };
    case "NO_COMMITMENT":
    default:
      return {
        subject: "Novedades del equipo",
        body: `Hola,\n\nSolo quería compartirte cómo va todo por acá, sin nada urgente de tu lado. Cualquier cosa me avisas.\n\nSaludos,\n${senderName}`,
        commitments: [],
      };
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

export const ALL_CATEGORIES: TemplateCategory[] = [
  "OVERDUE",
  "URGENT_48H",
  "THIS_WEEK",
  "NEXT_MONTH",
  "NO_COMMITMENT",
  "MULTIPLE",
];

import { MOCK_SENDERS, type MockSender } from "./senders";
import { MOCK_ACCOUNTS, type MockAccount } from "./accounts";
import { ALL_CATEGORIES, buildEmailBody, type MockCommitment, type TemplateCategory } from "./email-templates";

export type GeneratedEmail = {
  sender: MockSender;
  account: MockAccount;
  threadId: string;
  subject: string;
  body: string;
  receivedAt: Date;
  commitments: MockCommitment[];
  category: TemplateCategory;
};

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

/**
 * Genera `count` correos de ejemplo, distribuyendo remitentes (mezcla VIP/no-VIP)
 * y categorías de compromiso de forma determinística pero variada, con fechas
 * de recepción escalonadas hacia atrás desde `now`.
 */
export function generateMockEmails(count: number, now: Date = new Date()): GeneratedEmail[] {
  const emails: GeneratedEmail[] = [];

  for (let i = 0; i < count; i++) {
    // Strides distintos y coprimos con las longitudes de cada lista para que
    // remitente y categoría no avancen en el mismo ciclo (evita que la
    // bandeja muestre el mismo remitente+compromiso repetido en bloque).
    const sender = pick(MOCK_SENDERS, i * 7);
    const category = pick(ALL_CATEGORIES, i * 5);
    // Stride 2: coprimo con la longitud de MOCK_ACCOUNTS (3), a diferencia de
    // 3 que colapsaría siempre en el mismo índice.
    const account = pick(MOCK_ACCOUNTS, i * 2);
    const receivedAt = new Date(now.getTime() - i * 45 * 60 * 1000); // escalonado cada 45 min hacia atrás

    // Jitter determinístico (~±8h) para que los compromisos de una misma
    // categoría no comparta el mismo dueAt exacto en decenas de correos —
    // mantiene el significado de la categoría (vencido, <48h, etc.) pero
    // evita que la bandeja se vea con filas idénticas apiladas.
    const jitterHours = ((i * 13) % 17) - 8;
    const reference = new Date(now.getTime() + jitterHours * 60 * 60 * 1000);
    const template = buildEmailBody(category, sender.name, reference);

    emails.push({
      sender,
      account,
      threadId: `thread-${i}`,
      subject: template.subject,
      body: template.body,
      receivedAt,
      commitments: template.commitments,
      category,
    });
  }

  return emails;
}

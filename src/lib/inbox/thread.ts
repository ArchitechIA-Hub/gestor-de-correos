import { prisma } from "@/lib/db/prisma";
import type { DraftResponseType } from "@/generated/prisma/enums";

export type ThreadItem =
  | {
      kind: "received";
      id: string;
      at: Date;
      senderName: string;
      subject: string;
      summary: string | null;
      body: string;
      isCurrent: boolean;
    }
  | {
      kind: "sent";
      id: string;
      at: Date;
      body: string;
      responseType: DraftResponseType | null;
    };

/**
 * Reconstruye la conversación completa de un correo: todos los correos
 * recibidos con el mismo `threadId` + las respuestas que se enviaron (drafts
 * aprobados), ordenados cronológicamente. Devuelve [] si el hilo tiene un solo
 * mensaje y ninguna respuesta (no hay nada que "conversar").
 */
export async function getEmailThread(threadId: string, currentEmailId: string): Promise<ThreadItem[]> {
  const [emails, sentDrafts] = await Promise.all([
    prisma.email.findMany({
      where: { threadId },
      select: { id: true, receivedAt: true, subject: true, summary: true, rawBody: true, sender: { select: { name: true } } },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.draft.findMany({
      where: { status: "APPROVED", email: { threadId } },
      select: { id: true, content: true, responseType: true, approvedAt: true, generatedAt: true },
      orderBy: { approvedAt: "asc" },
    }),
  ]);

  const items: ThreadItem[] = [
    ...emails.map((e): ThreadItem => ({
      kind: "received",
      id: e.id,
      at: e.receivedAt,
      senderName: e.sender.name,
      subject: e.subject,
      summary: e.summary,
      body: e.rawBody,
      isCurrent: e.id === currentEmailId,
    })),
    ...sentDrafts.map((d): ThreadItem => ({
      kind: "sent",
      id: d.id,
      at: d.approvedAt ?? d.generatedAt,
      body: d.content,
      responseType: d.responseType,
    })),
  ];

  if (items.length <= 1) return [];

  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  return items;
}

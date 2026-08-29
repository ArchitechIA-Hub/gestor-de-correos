import type { gmail_v1 } from "googleapis";

export type ParsedGmailAttachment = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  gmailAttachmentId: string;
};

export type ParsedGmailMessage = {
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: Date;
  rawBody: string;
  attachments: ParsedGmailAttachment[];
  /** Header RFC `Message-ID` original — para enhebrar (In-Reply-To/References) una respuesta real. */
  rfcMessageId: string | null;
};

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/**
 * Parsea el header `From: "Nombre" <email@dominio.com>` (o variantes sin
 * comillas / sin nombre) en sus dos componentes.
 */
function parseFromHeader(value: string): { name: string; email: string } {
  const match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    return { name: name || email, email };
  }
  const trimmed = value.trim();
  return { name: trimmed, email: trimmed };
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

const MAX_INLINE_URL_LENGTH = 60;

/**
 * Los correos reales (invitaciones de calendario, newsletters) suelen traer
 * URLs de tracking larguísimas (decenas de parámetros en base64) que no
 * aportan nada legible y dominan visualmente el cuerpo mostrado. Se recortan
 * las URLs largas mientras se conservan las cortas y útiles (p. ej. un link
 * de Google Meet).
 */
export function cleanBodyText(text: string): string {
  const withoutLongUrls = text.replace(/https?:\/\/\S+/g, (url) => (url.length > MAX_INLINE_URL_LENGTH ? "" : url));

  return withoutLongUrls
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Recorre `payload.parts` recursivamente (los correos reales llegan como
 * multipart/alternative o multipart/mixed anidado) buscando el mejor cuerpo
 * de texto disponible y recolectando todas las partes que son adjuntos reales
 * (tienen `filename` y `body.attachmentId`).
 */
function walkParts(
  part: gmail_v1.Schema$MessagePart,
  acc: { plainText: string | null; htmlText: string | null; attachments: ParsedGmailAttachment[] }
) {
  const mimeType = part.mimeType ?? "";

  if (part.filename && part.body?.attachmentId) {
    acc.attachments.push({
      filename: part.filename,
      mimeType: mimeType || "application/octet-stream",
      sizeBytes: part.body.size ?? 0,
      gmailAttachmentId: part.body.attachmentId,
    });
  } else if (mimeType === "text/plain" && part.body?.data && !acc.plainText) {
    acc.plainText = decodeBase64Url(part.body.data);
  } else if (mimeType === "text/html" && part.body?.data && !acc.htmlText) {
    acc.htmlText = decodeBase64Url(part.body.data);
  }

  for (const child of part.parts ?? []) {
    walkParts(child, acc);
  }
}

export function parseGmailMessage(message: gmail_v1.Schema$Message): ParsedGmailMessage {
  const payload = message.payload;
  const headers = payload?.headers ?? undefined;

  const { name: senderName, email: senderEmail } = parseFromHeader(getHeader(headers, "From"));
  const subject = getHeader(headers, "Subject") || "(sin asunto)";
  const dateHeader = getHeader(headers, "Date");
  const receivedAt = dateHeader ? new Date(dateHeader) : new Date(Number(message.internalDate ?? Date.now()));
  const rfcMessageId = getHeader(headers, "Message-ID") || null;

  const acc: { plainText: string | null; htmlText: string | null; attachments: ParsedGmailAttachment[] } = {
    plainText: null,
    htmlText: null,
    attachments: [],
  };
  if (payload) walkParts(payload, acc);

  const rawBody = cleanBodyText(acc.plainText ?? (acc.htmlText ? stripHtml(acc.htmlText) : message.snippet ?? ""));

  return {
    subject,
    senderName,
    senderEmail,
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    rawBody,
    attachments: acc.attachments,
    rfcMessageId,
  };
}

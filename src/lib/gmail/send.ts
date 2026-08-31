import type { MailAccountModel } from "@/generated/prisma/models";
import { getGmailClientForAccount } from "./client";

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeHeaderUtf8(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

/**
 * Tope de tamaño total de los adjuntos de una respuesta (suma de los
 * bytes decodificados). El request `messages.send` con `raw` admite hasta
 * ~35 MB; dejamos margen porque base64 infla ~33% y el server action
 * también tiene su propio `bodySizeLimit`.
 */
export const MAX_OUTGOING_ATTACHMENTS_BYTES = 10 * 1024 * 1024;

export type OutgoingAttachment = {
  filename: string;
  mimeType: string;
  /** Contenido del archivo codificado en base64 (estándar, no url-safe). */
  contentBase64: string;
};

export type SendGmailReplyParams = {
  mailAccount: Pick<MailAccountModel, "googleRefreshToken">;
  to: string;
  subject: string;
  body: string;
  threadId: string;
  /** Header RFC `Message-ID` del correo original, si se conoce, para enhebrar la respuesta. */
  inReplyTo: string | null;
  /** Archivos a adjuntar. Ausente o vacío = respuesta solo texto. */
  attachments?: OutgoingAttachment[];
};

function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n]/g, "_").trim() || "adjunto";
}

/** Parte el base64 en líneas de 76 caracteres, como exige el MIME. */
function foldBase64(b64: string): string {
  return b64.replace(/.{76}/g, "$&\r\n");
}

function buildPlainMessage(headers: string[], body: string): string {
  return `${[
    ...headers,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ].join("\r\n")}\r\n\r\n${body}`;
}

function buildMultipartMessage(headers: string[], body: string, attachments: OutgoingAttachment[]): string {
  const boundary = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const parts: string[] = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ];
  for (const att of attachments) {
    const filename = sanitizeFilename(att.filename);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType || "application/octet-stream"}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      foldBase64(att.contentBase64.replace(/\s/g, "")),
    );
  }
  parts.push(`--${boundary}--`, "");

  return `${[
    ...headers,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

/**
 * Envía una respuesta real vía la API de Gmail (requiere el scope
 * `gmail.send`). Se llama únicamente desde `approveDraft` tras la
 * confirmación explícita del usuario — nunca de forma automática.
 */
export async function sendGmailReply(params: SendGmailReplyParams): Promise<string> {
  const gmail = getGmailClientForAccount(params.mailAccount);
  const subject = /^re:/i.test(params.subject) ? params.subject : `Re: ${params.subject}`;
  const attachments = params.attachments ?? [];

  const totalBytes = attachments.reduce(
    (sum, att) => sum + Buffer.byteLength(att.contentBase64.replace(/\s/g, ""), "base64"),
    0
  );
  if (totalBytes > MAX_OUTGOING_ATTACHMENTS_BYTES) {
    throw new Error(
      `Los adjuntos superan el límite de ${Math.round(MAX_OUTGOING_ATTACHMENTS_BYTES / (1024 * 1024))} MB.`
    );
  }

  const headers = [
    `To: ${params.to}`,
    `Subject: ${encodeHeaderUtf8(subject)}`,
  ];
  if (params.inReplyTo) {
    headers.push(`In-Reply-To: ${params.inReplyTo}`);
    headers.push(`References: ${params.inReplyTo}`);
  }

  const message =
    attachments.length > 0
      ? buildMultipartMessage(headers, params.body, attachments)
      : buildPlainMessage(headers, params.body);

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodeBase64Url(message), threadId: params.threadId },
  });

  if (!response.data.id) {
    throw new Error("Gmail no devolvió un id de mensaje al enviar.");
  }
  return response.data.id;
}

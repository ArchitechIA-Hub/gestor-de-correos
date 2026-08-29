import type { MailAccountModel } from "@/generated/prisma/models";
import { getGmailClientForAccount } from "./client";

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeHeaderUtf8(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export type SendGmailReplyParams = {
  mailAccount: Pick<MailAccountModel, "googleRefreshToken">;
  to: string;
  subject: string;
  body: string;
  threadId: string;
  /** Header RFC `Message-ID` del correo original, si se conoce, para enhebrar la respuesta. */
  inReplyTo: string | null;
};

/**
 * Envía una respuesta real vía la API de Gmail (requiere el scope
 * `gmail.send`). Se llama únicamente desde `approveDraft` tras la
 * confirmación explícita del usuario — nunca de forma automática.
 */
export async function sendGmailReply(params: SendGmailReplyParams): Promise<string> {
  const gmail = getGmailClientForAccount(params.mailAccount);
  const subject = /^re:/i.test(params.subject) ? params.subject : `Re: ${params.subject}`;

  const headers = [
    `To: ${params.to}`,
    `Subject: ${encodeHeaderUtf8(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (params.inReplyTo) {
    headers.push(`In-Reply-To: ${params.inReplyTo}`);
    headers.push(`References: ${params.inReplyTo}`);
  }

  const raw = encodeBase64Url(`${headers.join("\r\n")}\r\n\r\n${params.body}`);

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: params.threadId },
  });

  if (!response.data.id) {
    throw new Error("Gmail no devolvió un id de mensaje al enviar.");
  }
  return response.data.id;
}

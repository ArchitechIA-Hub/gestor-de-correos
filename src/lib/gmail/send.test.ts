import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();
vi.mock("./client", () => ({
  getGmailClientForAccount: () => ({ users: { messages: { send: sendMock } } }),
}));

import { sendGmailReply, MAX_OUTGOING_ATTACHMENTS_BYTES } from "./send";

function decodeRaw(): string {
  const raw = sendMock.mock.calls[0][0].requestBody.raw as string;
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

const baseParams = {
  mailAccount: { googleRefreshToken: "token" },
  to: "dest@example.com",
  subject: "Hola",
  threadId: "thread-1",
  inReplyTo: "<orig@example.com>",
};

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "msg-1" } });
});

describe("sendGmailReply", () => {
  it("sin adjuntos: envía un mensaje text/plain simple", async () => {
    await sendGmailReply({ ...baseParams, body: "Cuerpo" });

    const message = decodeRaw();
    expect(message).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(message).not.toContain("multipart/mixed");
    expect(message).toContain("Subject: =?UTF-8?B?");
    expect(message).toContain("In-Reply-To: <orig@example.com>");
    expect(message).toContain("Cuerpo");
    expect(sendMock.mock.calls[0][0].requestBody.threadId).toBe("thread-1");
  });

  it("prefija Re: solo si el asunto no lo trae ya", async () => {
    await sendGmailReply({ ...baseParams, subject: "RE: Hola", body: "x" });
    const subjectLine = Buffer.from(
      decodeRaw().match(/Subject: =\?UTF-8\?B\?(.+?)\?=/)![1],
      "base64"
    ).toString("utf-8");
    expect(subjectLine).toBe("RE: Hola");
  });

  it("con adjuntos: arma multipart/mixed con el archivo en base64", async () => {
    const contentBase64 = Buffer.from("contenido del archivo").toString("base64");
    await sendGmailReply({
      ...baseParams,
      body: "Adjunto la propuesta.",
      attachments: [{ filename: "propuesta.pdf", mimeType: "application/pdf", contentBase64 }],
    });

    const message = decodeRaw();
    const boundary = message.match(/boundary="(.+?)"/)![1];
    expect(message).toContain("Content-Type: multipart/mixed;");
    expect(message).toContain("Adjunto la propuesta.");
    expect(message).toContain('Content-Disposition: attachment; filename="propuesta.pdf"');
    expect(message).toContain("Content-Transfer-Encoding: base64");
    expect(message).toContain(contentBase64);
    expect(message.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });

  it("rechaza si los adjuntos superan el tope de tamaño", async () => {
    const tooBig = Buffer.alloc(MAX_OUTGOING_ATTACHMENTS_BYTES + 1024).toString("base64");
    await expect(
      sendGmailReply({
        ...baseParams,
        body: "x",
        attachments: [{ filename: "grande.bin", mimeType: "application/octet-stream", contentBase64: tooBig }],
      })
    ).rejects.toThrow(/límite/);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

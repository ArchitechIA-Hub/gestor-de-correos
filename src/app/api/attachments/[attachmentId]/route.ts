import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getGmailClientForAccount } from "@/lib/gmail/client";

/**
 * Sirve un adjunto real bajo demanda: los bytes no se guardan en nuestra BD
 * (solo metadatos), se piden a la API de Gmail en cada request usando el
 * gmailMessageId + gmailAttachmentId guardados al importar.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;

  const attachment = await prisma.emailAttachment.findUnique({
    where: { id: attachmentId },
    include: { email: { include: { mailAccount: true } } },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Adjunto no encontrado." }, { status: 404 });
  }
  if (!attachment.email.gmailMessageId) {
    return NextResponse.json({ error: "Este correo no proviene de Gmail." }, { status: 400 });
  }

  const gmail = getGmailClientForAccount(attachment.email.mailAccount);
  const { data } = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId: attachment.email.gmailMessageId,
    id: attachment.gmailAttachmentId,
  });

  if (!data.data) {
    return NextResponse.json({ error: "No se pudo obtener el contenido del adjunto." }, { status: 502 });
  }

  const buffer = Buffer.from(data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const download = request.nextUrl.searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(attachment.filename)}"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}

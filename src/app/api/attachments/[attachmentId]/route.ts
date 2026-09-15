import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { getGmailClientForAccount } from "@/lib/gmail/client";
import { describeGoogleApiError } from "@/lib/gmail/errors";

/**
 * Sirve un adjunto real bajo demanda: los bytes no se guardan en nuestra BD
 * (solo metadatos), se piden a la API de Gmail en cada request usando el
 * gmailMessageId + gmailAttachmentId guardados al importar.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { organizationId } = await requireSession();
  const { attachmentId } = await params;

  // EmailAttachment no lleva organizationId directo — ownership vía el email
  // al que pertenece.
  const attachment = await prisma.emailAttachment.findFirst({
    where: { id: attachmentId, email: { organizationId } },
    include: { email: { include: { mailAccount: true } } },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Adjunto no encontrado." }, { status: 404 });
  }
  if (!attachment.email.gmailMessageId) {
    return NextResponse.json({ error: "Este correo no proviene de Gmail." }, { status: 400 });
  }

  let data;
  try {
    const gmail = getGmailClientForAccount(attachment.email.mailAccount);
    ({ data } = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: attachment.email.gmailMessageId,
      id: attachment.gmailAttachmentId,
    }));
  } catch (error) {
    // No dejar propagar el error de gaxios/googleapis tal cual — puede traer
    // el refresh_token en el cuerpo crudo de la request (ver
    // src/lib/gmail/errors.ts, mismo criterio que el resto de llamadas a la
    // API de Gmail en el repo).
    console.error("[attachments] fallo al pedir el adjunto a Gmail:", describeGoogleApiError(error));
    return NextResponse.json({ error: "No se pudo obtener el adjunto de Gmail." }, { status: 502 });
  }

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

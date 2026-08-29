import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildIcsContent } from "@/lib/calendar/links";

export async function GET(_request: Request, { params }: { params: Promise<{ commitmentId: string }> }) {
  const { commitmentId } = await params;

  const commitment = await prisma.commitment.findUnique({ where: { id: commitmentId } });
  if (!commitment || !commitment.dueAt) {
    return NextResponse.json({ error: "Compromiso no encontrado o sin fecha." }, { status: 404 });
  }

  const ics = buildIcsContent({
    uid: commitment.id,
    title: commitment.description,
    description: commitment.sourceExcerpt,
    start: commitment.dueAt,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="compromiso.ics"',
    },
  });
}

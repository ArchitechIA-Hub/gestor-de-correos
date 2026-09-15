import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { buildIcsContent } from "@/lib/calendar/links";

export async function GET(_request: Request, { params }: { params: Promise<{ commitmentId: string }> }) {
  const { organizationId } = await requireSession();
  const { commitmentId } = await params;

  // Commitment no lleva organizationId directo — se filtra vía el join a
  // Email, igual que en getUpcomingCalendarEvents/getRescuePlan. Sin esto,
  // cualquier usuario autenticado podía descargar el .ics de un compromiso
  // de OTRA organización si conocía/adivinaba su id.
  const commitment = await prisma.commitment.findFirst({
    where: { id: commitmentId, email: { organizationId } },
  });
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

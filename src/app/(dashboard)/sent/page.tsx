import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DraftResponseType } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

function formatDateTime(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const RESPONSE_TYPE_LABELS: Record<DraftResponseType, string> = {
  AFFIRMATIVE: "Afirmativa",
  NEGATIVE: "Negativa",
  INTERMEDIATE: "Intermedia",
};

export default async function SentPage() {
  const sentDrafts = await prisma.draft.findMany({
    where: { status: "APPROVED", email: { mailAccount: { provider: "gmail" } } },
    include: { email: { include: { sender: true } } },
    orderBy: { approvedAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Enviados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Respuestas reales despachadas vía Gmail tras tu aprobación explícita — no incluye borradores
          aprobados en cuentas de prueba, que nunca se envían de verdad.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuándo</TableHead>
              <TableHead>Para</TableHead>
              <TableHead>Asunto</TableHead>
              <TableHead>Postura</TableHead>
              <TableHead>Contenido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sentDrafts.map((draft) => (
              <TableRow key={draft.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {draft.approvedAt ? formatDateTime(draft.approvedAt) : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{draft.email.sender.email}</TableCell>
                <TableCell className="max-w-xs">
                  <Link href={`/inbox/${draft.emailId}`} className="text-sm text-primary underline-offset-4 hover:underline">
                    {draft.email.subject}
                  </Link>
                </TableCell>
                <TableCell>
                  {draft.responseType && <Badge variant="secondary">{RESPONSE_TYPE_LABELS[draft.responseType]}</Badge>}
                </TableCell>
                <TableCell className="max-w-sm truncate text-xs text-muted-foreground">{draft.content}</TableCell>
              </TableRow>
            ))}
            {sentDrafts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Todavía no se ha enviado ninguna respuesta real.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

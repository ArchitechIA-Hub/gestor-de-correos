import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RescueActions } from "@/components/rescue/rescue-actions";
import { getCurrentServiceLevel } from "@/lib/priority/current";
import { getRescuePlan } from "@/lib/priority/rescue";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function RescuePage() {
  const { features } = await getCurrentServiceLevel();

  if (!features.rescueMode) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl text-foreground">Modo rescate</h1>
        <p className="text-sm text-muted-foreground">
          No disponible en tu nivel de servicio actual. Se activa en Nivel 4 — Crítico.
        </p>
      </div>
    );
  }

  const commitments = await getRescuePlan();
  const overdueCount = commitments.filter((c) => c.status === "OVERDUE").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Modo rescate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan de choque: los {commitments.length} compromisos más urgentes ahora mismo, por urgencia real +
          importancia del remitente.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">En el plan de choque</p>
          <p className="font-heading text-3xl text-foreground">{commitments.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Ya vencidos</p>
          <p className="font-heading text-3xl text-urgent">{overdueCount}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Remitente</TableHead>
              <TableHead>Compromiso</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {commitments.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/inbox/${c.email.id}`} className="flex items-center gap-1.5">
                    {c.email.sender.name}
                    {c.email.sender.isVip && <Badge className="bg-vip text-vip-foreground">VIP</Badge>}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.email.subject}</p>
                </TableCell>
                <TableCell className="max-w-[18rem]">
                  <span className="line-clamp-2 text-sm">{c.description}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {c.dueAt ? formatDate(c.dueAt) : "—"}
                </TableCell>
                <TableCell>
                  {c.status === "OVERDUE" ? (
                    <Badge className="bg-urgent text-urgent-foreground">Vencido</Badge>
                  ) : (
                    <Badge variant="outline">Pendiente</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <RescueActions commitmentId={c.id} />
                </TableCell>
              </TableRow>
            ))}
            {commitments.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Sin compromisos pendientes — no hace falta plan de choque.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

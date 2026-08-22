import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScanButton } from "@/components/inbox/scan-button";
import { getCurrentServiceLevel } from "@/lib/priority/current";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function InboxPage() {
  const { backlogCount } = await getCurrentServiceLevel();

  const emails = await prisma.email.findMany({
    where: { status: "CLASSIFIED" },
    include: {
      sender: true,
      commitments: { where: { status: { in: ["PENDING", "OVERDUE"] } }, orderBy: { dueAt: "asc" }, take: 1 },
    },
    orderBy: [{ priorityScore: "desc" }, { receivedAt: "desc" }],
    take: 50,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Bandeja priorizada</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ordenada por urgencia real e importancia del remitente — no por fecha de llegada.
          </p>
        </div>
        <ScanButton backlogCount={backlogCount} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Remitente</TableHead>
              <TableHead>Asunto</TableHead>
              <TableHead>Compromiso</TableHead>
              <TableHead>Recibido</TableHead>
              <TableHead className="text-right">Prioridad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emails.map((email) => {
              const nearest = email.commitments[0];
              return (
                <TableRow key={email.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/inbox/${email.id}`} className="block">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{email.sender.name}</span>
                        {email.sender.isVip && (
                          <Badge className="bg-vip text-vip-foreground">VIP</Badge>
                        )}
                      </div>
                      {email.sender.organization && (
                        <span className="text-xs text-muted-foreground">{email.sender.organization}</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/inbox/${email.id}`} className="line-clamp-1 block max-w-xs">
                      {email.subject}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {nearest ? (
                      <div className="flex flex-col">
                        <span className="line-clamp-1 text-sm">{nearest.description}</span>
                        {nearest.dueAt && (
                          <span className="text-xs text-muted-foreground">Vence {formatDate(nearest.dueAt)}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(email.receivedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {email.isUrgent ? (
                      <Badge className="bg-urgent text-urgent-foreground">Urgente &lt;48h</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{email.priorityScore.toFixed(2)}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {emails.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Todavía no hay correos clasificados. Escanea el backlog para empezar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

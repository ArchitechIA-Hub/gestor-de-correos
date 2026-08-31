import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RevertButton } from "@/components/audit/revert-button";
import { getUserTimeZone } from "@/lib/settings";
import { formatShortDateTime } from "@/lib/format/date";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  CLASSIFY: "Clasificación",
  DETECT_COMMITMENT: "Compromiso detectado",
  MARK_URGENT: "Marcado urgente",
  CREATE_CALENDAR_EVENT: "Evento de calendario creado",
  SEND_WHATSAPP_NOTIFICATION: "Notificación WhatsApp",
  GENERATE_DRAFT: "Borrador generado",
  EDIT_DRAFT: "Borrador editado",
  APPROVE_DRAFT: "Borrador aprobado/descartado",
  TOGGLE_EXTRA: "Extra activado/desactivado",
  SEND_DIGEST: "Informe enviado",
  REVERT: "Reversión",
  MARK_MARKETING: "Marcado como marketing",
  CATEGORIZE: "Movido a/desde Finanzas",
  MANAGE_MAIL_ACCOUNT: "Cuenta de correo gestionada",
  UPDATE_COMMITMENT_STATUS: "Estado de compromiso actualizado",
  CREATE_URGENT_ALERT: "Alerta push creada",
  IMPORT_EMAIL: "Correo importado de Gmail",
  SEND_DRAFT: "Respuesta enviada",
};

export default async function AuditPage() {
  const [entries, tz] = await Promise.all([
    prisma.auditLogEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getUserTimeZone(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Auditoría de acciones automáticas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toda acción que el sistema toma automáticamente queda registrada aquí, y puede revertirse.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuándo</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Entidad</TableHead>
              <TableHead>Antes → Después</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead className="text-right">Reversión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatShortDateTime(entry.createdAt, tz)}
                </TableCell>
                <TableCell className="text-sm">{ACTION_LABELS[entry.actionType] ?? entry.actionType}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {entry.entityType} · {entry.entityId.slice(0, 8)}
                </TableCell>
                <TableCell className="max-w-xs">
                  <div className="flex flex-col gap-0.5 text-xs">
                    {entry.payloadBefore && (
                      <code className="truncate text-muted-foreground line-through">{entry.payloadBefore}</code>
                    )}
                    {entry.payloadAfter && <code className="truncate text-foreground">{entry.payloadAfter}</code>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={entry.performedBy === "SYSTEM" ? "outline" : "secondary"}>
                    {entry.performedBy === "SYSTEM" ? "Sistema" : "Usuario"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {entry.revertedAt ? (
                    <span className="text-xs text-muted-foreground">Revertido</span>
                  ) : (
                    <RevertButton auditLogEntryId={entry.id} disabled={!entry.reversible} />
                  )}
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Todavía no hay acciones registradas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

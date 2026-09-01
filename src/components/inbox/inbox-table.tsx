"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MarkReadButton } from "@/components/inbox/mark-read-button";
import { MoveToMenu } from "@/components/inbox/move-to-menu";
import { formatShortDateTime } from "@/lib/format/date";
import { bucketFromView } from "@/lib/inbox/buckets";
import { cn } from "@/lib/utils";

export type InboxRow = {
  id: string;
  subject: string;
  receivedAt: Date;
  readAt: Date | null;
  respondedAt: Date | null;
  isUrgent: boolean;
  isMarketing: boolean;
  marketingReason: string | null;
  priorityScore: number;
  sender: { name: string; isVip: boolean; organization: string | null };
  mailAccount: { label: string };
  commitments?: { description: string; dueAt: Date | null }[];
};

export function InboxTable({
  emails,
  view,
  tz,
  emptyMessage,
}: {
  emails: InboxRow[];
  view: string | undefined;
  tz: string;
  emptyMessage: string;
}) {
  const isMarketingView = view === "marketing";
  const currentBucket = bucketFromView(view);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visibleIds = emails.map((e) => e.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visibleIds));
  }

  function clear() {
    setSelected(new Set());
  }

  const selectedList = [...selected].filter((id) => visibleIds.includes(id));

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {selectedList.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="font-medium text-foreground">
            {selectedList.length} seleccionado{selectedList.length === 1 ? "" : "s"}
          </span>
          <MoveToMenu emailIds={selectedList} currentBucket={currentBucket} onDone={clear} />
          <button
            type="button"
            onClick={clear}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Limpiar selección
          </button>
        </div>
      )}

      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border">
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-9 py-2 pl-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Seleccionar todo"
                    className="size-3.5 align-middle"
                  />
                </TableHead>
                <TableHead className="py-2 text-xs">Remitente</TableHead>
                <TableHead className="py-2 text-xs">Cuenta</TableHead>
                <TableHead className="py-2 text-xs">Asunto</TableHead>
                <TableHead className="py-2 text-xs">{isMarketingView ? "Motivo" : "Compromiso"}</TableHead>
                <TableHead className="py-2 text-xs">Recibido</TableHead>
                <TableHead className="py-2 text-right text-xs whitespace-nowrap">
                  {isMarketingView ? "" : "Prioridad"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((email) => {
                const nearest = email.commitments?.[0];
                const isUnread = !isMarketingView && !email.readAt;
                const isSelected = selected.has(email.id);
                return (
                  <TableRow key={email.id} className={cn(isSelected && "bg-secondary/40")}>
                    <TableCell className="py-1.5 pl-3 align-middle">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(email.id)}
                        aria-label={`Seleccionar correo de ${email.sender.name}`}
                        className="size-3.5 align-middle"
                      />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Link href={`/inbox/${email.id}`} className="block">
                        <div className="flex items-center gap-2">
                          {isUnread && (
                            <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="No leído" />
                          )}
                          <span
                            className={cn(
                              "text-sm",
                              isUnread ? "font-bold text-foreground" : "font-medium text-muted-foreground"
                            )}
                          >
                            {email.sender.name}
                          </span>
                          {email.sender.isVip && <Badge className="bg-vip text-vip-foreground">VIP</Badge>}
                        </div>
                        {email.sender.organization && (
                          <span className="text-xs text-muted-foreground">{email.sender.organization}</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                      {email.mailAccount.label}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Link
                        href={`/inbox/${email.id}`}
                        className={cn(
                          "line-clamp-1 block max-w-2xs text-sm",
                          isUnread ? "font-bold text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {email.subject}
                      </Link>
                    </TableCell>
                    {isMarketingView ? (
                      <TableCell className="max-w-2xs py-1.5">
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {email.marketingReason ?? "—"}
                        </span>
                      </TableCell>
                    ) : (
                      <TableCell className="max-w-2xs py-1.5">
                        {nearest ? (
                          <div className="flex flex-col">
                            <span className="line-clamp-1 text-xs">{nearest.description}</span>
                            {nearest.dueAt && (
                              <span className="text-xs text-muted-foreground">
                                Vence {formatShortDateTime(nearest.dueAt, tz)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                      {formatShortDateTime(email.receivedAt, tz)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end gap-1.5">
                        {!isMarketingView &&
                          (email.isUrgent ? (
                            <Badge className="bg-urgent text-urgent-foreground">Urgente &lt;48h</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{email.priorityScore.toFixed(2)}</span>
                          ))}
                        {email.respondedAt && <Badge variant="secondary">Respondido</Badge>}
                        <MarkReadButton emailId={email.id} isRead={!!email.readAt} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {emails.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

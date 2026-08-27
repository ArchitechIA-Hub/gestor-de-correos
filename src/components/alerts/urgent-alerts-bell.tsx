"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { markAlertRead, markAllAlertsRead } from "@/app/actions/mark-alert-read";

export type UrgentAlertItem = {
  id: string;
  emailId: string;
  message: string;
  dueAt: Date | null;
  createdAt: Date;
};

function formatDueAt(d: Date | null) {
  if (!d) return null;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function UrgentAlertsBell({ initialAlerts }: { initialAlerts: UrgentAlertItem[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [isPending, startTransition] = useTransition();
  const unreadCount = alerts.length;

  function handleMarkRead(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    startTransition(() => {
      markAlertRead(id);
    });
  }

  function handleMarkAllRead() {
    setAlerts([]);
    startTransition(() => {
      markAllAlertsRead();
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label="Alertas urgentes" />
        }
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-urgent text-[10px] font-medium text-urgent-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="font-heading text-sm text-foreground">Alertas urgentes</span>
          {alerts.length > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Marcar todas leídas
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {alerts.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Sin alertas urgentes pendientes.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex flex-col gap-1 px-3 py-2.5">
                  <Link
                    href={`/inbox/${alert.emailId}`}
                    onClick={() => handleMarkRead(alert.id)}
                    className="text-xs leading-snug text-foreground hover:underline"
                  >
                    {alert.message}
                  </Link>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-urgent">
                      {formatDueAt(alert.dueAt) ? `Vence ${formatDueAt(alert.dueAt)}` : "Vencido"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleMarkRead(alert.id)}
                      className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Marcar leída
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

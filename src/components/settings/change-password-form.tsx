"use client";

import { useState, useTransition } from "react";
import { changePassword } from "@/app/actions/change-password";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (newPassword !== confirmPassword) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    startTransition(async () => {
      try {
        await changePassword({ currentPassword, newPassword });
        setStatus("Contraseña actualizada.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <div>
        <p className="text-sm font-medium text-foreground">Contraseña</p>
        <p className="text-xs text-muted-foreground">Cambia la contraseña de tu cuenta.</p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="currentPassword" className="text-sm font-medium text-foreground">
          Contraseña actual
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={isPending}
          required
          className="h-8 w-full max-w-xs rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="newPassword" className="text-sm font-medium text-foreground">
          Nueva contraseña
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={isPending}
          required
          minLength={8}
          className="h-8 w-full max-w-xs rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
          Confirmar nueva contraseña
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isPending}
          required
          minLength={8}
          className="h-8 w-full max-w-xs rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="h-8 w-fit rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Cambiar contraseña
        </button>
        {status && <p className="text-xs text-muted-foreground">{status}</p>}
        {error && <p className="text-xs text-urgent">{error}</p>}
      </div>
    </form>
  );
}

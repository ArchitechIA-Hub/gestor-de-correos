"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/actions/profile-settings";

export function ProfileForm({
  currentUserName,
  currentOrganizationName,
}: {
  currentUserName: string;
  currentOrganizationName: string;
}) {
  const [userName, setUserName] = useState(currentUserName);
  const [organizationName, setOrganizationName] = useState(currentOrganizationName);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        await updateProfile({ userName, organizationName });
        setStatus("Guardado.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el perfil.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="userName" className="text-sm font-medium text-foreground">
          Tu nombre
        </label>
        <input
          id="userName"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          disabled={isPending}
          className="h-8 w-full max-w-xs rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="organizationName" className="text-sm font-medium text-foreground">
          Nombre de la organización
        </label>
        <p className="text-xs text-muted-foreground">
          Aparece en el Informe y como firma en los borradores de respuesta.
        </p>
        <input
          id="organizationName"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          disabled={isPending}
          className="h-8 w-full max-w-xs rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="h-8 w-fit rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Guardar
        </button>
        {status && <p className="text-xs text-muted-foreground">{status}</p>}
        {error && <p className="text-xs text-urgent">{error}</p>}
      </div>
    </form>
  );
}

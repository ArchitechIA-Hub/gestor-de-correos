"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateDraftForEmail } from "@/app/actions/generate-draft";
import { approveDraft, discardDraft } from "@/app/actions/approve-draft";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type DraftItem = {
  id: string;
  content: string;
  status: string;
  generatedAt: Date;
  approvedAt: Date | null;
};

export function DraftPanel({
  emailId,
  drafts,
  draftGenerationEnabled,
}: {
  emailId: string;
  drafts: DraftItem[];
  draftGenerationEnabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        await generateDraftForEmail(emailId);
        router.refresh();
      } catch {
        setError(
          "No se pudo generar el borrador. Verifica que ANTHROPIC_API_KEY esté configurada correctamente."
        );
      }
    });
  }

  function handleApprove(draftId: string) {
    startTransition(async () => {
      await approveDraft(draftId);
      router.refresh();
    });
  }

  function handleDiscard(draftId: string) {
    startTransition(async () => {
      await discardDraft(draftId);
      router.refresh();
    });
  }

  if (!draftGenerationEnabled) {
    return (
      <p className="text-sm text-muted-foreground">
        La generación de borradores se activa a partir del Nivel de servicio 2 (Moderado).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={handleGenerate} disabled={isPending} size="sm" className="w-fit">
        {isPending ? "Generando…" : "Generar borrador de respuesta"}
      </Button>
      {error && <p className="text-sm text-urgent">{error}</p>}

      {drafts.map((draft) => (
        <div key={draft.id} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <Badge variant={draft.status === "APPROVED" ? "default" : "outline"}>
              {draft.status === "PENDING_REVIEW" && "Pendiente de revisión"}
              {draft.status === "APPROVED" && "Aprobado"}
              {draft.status === "DISCARDED" && "Descartado"}
            </Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">{draft.content}</p>
          {draft.status === "PENDING_REVIEW" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => handleApprove(draft.id)} disabled={isPending}>
                Aprobar
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleDiscard(draft.id)} disabled={isPending}>
                Descartar
              </Button>
            </div>
          )}
          {draft.status === "APPROVED" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Aprobado — este prototipo no envía correos automáticamente; el envío queda fuera de alcance.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

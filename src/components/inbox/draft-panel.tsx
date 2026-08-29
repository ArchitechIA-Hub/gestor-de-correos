"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateDraftForEmail } from "@/app/actions/generate-draft";
import { approveDraft, discardDraft } from "@/app/actions/approve-draft";
import { editDraft } from "@/app/actions/edit-draft";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import type { DraftResponseType } from "@/generated/prisma/enums";

type DraftItem = {
  id: string;
  content: string;
  status: string;
  responseType: DraftResponseType | null;
  generatedAt: Date;
  approvedAt: Date | null;
};

const RESPONSE_TYPE_OPTIONS: { value: DraftResponseType; label: string }[] = [
  { value: "AFFIRMATIVE", label: "Afirmativa" },
  { value: "NEGATIVE", label: "Negativa" },
  { value: "INTERMEDIATE", label: "Intermedia" },
];

const RESPONSE_TYPE_LABELS: Record<DraftResponseType, string> = {
  AFFIRMATIVE: "Afirmativa",
  NEGATIVE: "Negativa",
  INTERMEDIATE: "Intermedia",
};

export function DraftPanel({
  emailId,
  drafts,
  draftGenerationEnabled,
  mailAccountProvider,
  recipientEmail,
}: {
  emailId: string;
  drafts: DraftItem[];
  draftGenerationEnabled: boolean;
  mailAccountProvider: string;
  recipientEmail: string;
}) {
  const isRealGmailAccount = mailAccountProvider === "gmail";
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<DraftResponseType | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDraftId, setConfirmDraftId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const router = useRouter();

  function handleGenerate(responseType: DraftResponseType) {
    setError(null);
    setGeneratingType(responseType);
    startTransition(async () => {
      try {
        await generateDraftForEmail(emailId, responseType);
        router.refresh();
      } catch {
        setError(
          "No se pudo generar el borrador. Verifica que OPENAI_API_KEY esté configurada correctamente."
        );
      } finally {
        setGeneratingType(null);
      }
    });
  }

  function handleApprove(draftId: string) {
    startTransition(async () => {
      await approveDraft(draftId);
      router.refresh();
    });
  }

  function openSendConfirm(draftId: string) {
    setSendError(null);
    setConfirmDraftId(draftId);
  }

  function handleConfirmSend(draftId: string) {
    setSendError(null);
    startTransition(async () => {
      try {
        await approveDraft(draftId);
        setConfirmDraftId(null);
        router.refresh();
      } catch {
        setSendError("No se pudo enviar el correo real. Verifica que la cuenta tenga el permiso gmail.send — puede que necesites reconectarla en Configuración.");
      }
    });
  }

  function handleDiscard(draftId: string) {
    startTransition(async () => {
      await discardDraft(draftId);
      router.refresh();
    });
  }

  function startEditing(draft: DraftItem) {
    setError(null);
    setEditingDraftId(draft.id);
    setEditValue(draft.content);
  }

  function cancelEditing() {
    setEditingDraftId(null);
    setEditValue("");
  }

  function handleSaveEdit(draftId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await editDraft(draftId, editValue);
        setEditingDraftId(null);
        setEditValue("");
        router.refresh();
      } catch {
        setError("No se pudo guardar la edición. El contenido no puede quedar vacío.");
      }
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
      <div className="flex flex-wrap gap-2">
        {RESPONSE_TYPE_OPTIONS.map((option) => (
          <Button
            key={option.value}
            onClick={() => handleGenerate(option.value)}
            disabled={isPending}
            size="sm"
            variant="outline"
          >
            {isPending && generatingType === option.value ? "Generando…" : `Generar respuesta ${option.label.toLowerCase()}`}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-urgent">{error}</p>}

      {drafts.map((draft) => (
        <div key={draft.id} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {draft.responseType && <Badge variant="secondary">{RESPONSE_TYPE_LABELS[draft.responseType]}</Badge>}
              <Badge variant={draft.status === "APPROVED" ? "default" : "outline"}>
                {draft.status === "PENDING_REVIEW" && "Pendiente de revisión"}
                {draft.status === "APPROVED" && "Aprobado"}
                {draft.status === "DISCARDED" && "Descartado"}
              </Badge>
            </div>
          </div>
          {editingDraftId === draft.id ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-foreground">{draft.content}</p>
          )}
          {draft.status === "PENDING_REVIEW" &&
            (editingDraftId === draft.id ? (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => handleSaveEdit(draft.id)} disabled={isPending}>
                  Guardar
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEditing} disabled={isPending}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                {isRealGmailAccount ? (
                  <Dialog
                    open={confirmDraftId === draft.id}
                    onOpenChange={(next) => (next ? openSendConfirm(draft.id) : setConfirmDraftId(null))}
                  >
                    <DialogTrigger render={<Button size="sm" disabled={isPending} />}>Aprobar</DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>¿Enviar esta respuesta?</DialogTitle>
                        <DialogDescription>
                          Se enviará un correo real a <strong>{recipientEmail}</strong> desde tu cuenta de
                          Gmail conectada. Esta acción no se puede deshacer.
                        </DialogDescription>
                      </DialogHeader>
                      {sendError && <p className="text-sm text-urgent">{sendError}</p>}
                      <DialogFooter>
                        <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                        <Button onClick={() => handleConfirmSend(draft.id)} disabled={isPending}>
                          {isPending ? "Enviando…" : "Sí, enviar"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button size="sm" onClick={() => handleApprove(draft.id)} disabled={isPending}>
                    Aprobar
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => startEditing(draft)} disabled={isPending}>
                  Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDiscard(draft.id)} disabled={isPending}>
                  Descartar
                </Button>
              </div>
            ))}
          {draft.status === "APPROVED" && (
            <p className="mt-3 text-xs text-muted-foreground">
              {isRealGmailAccount
                ? `Enviado a ${recipientEmail}${draft.approvedAt ? ` el ${new Date(draft.approvedAt).toLocaleString("es-ES")}` : ""}.`
                : "Aprobado — este prototipo no envía correos automáticamente; el envío queda fuera de alcance."}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

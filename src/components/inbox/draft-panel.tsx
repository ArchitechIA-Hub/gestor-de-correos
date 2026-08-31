"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X } from "lucide-react";
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

/** Debe coincidir con MAX_OUTGOING_ATTACHMENTS_BYTES en src/lib/gmail/send.ts. */
const MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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
  // Adjuntos elegidos por borrador (clave = draft.id). Se eligen en la
  // tarjeta del borrador, antes de abrir el diálogo de confirmación.
  const [filesByDraft, setFilesByDraft] = useState<Record<string, File[]>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const router = useRouter();

  function filesFor(draftId: string): File[] {
    return filesByDraft[draftId] ?? [];
  }

  function totalBytesFor(draftId: string): number {
    return filesFor(draftId).reduce((sum, f) => sum + f.size, 0);
  }

  function isTooLarge(draftId: string): boolean {
    return totalBytesFor(draftId) > MAX_ATTACHMENTS_BYTES;
  }

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

  function addAttachments(draftId: string, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    setFilesByDraft((prev) => {
      const current = prev[draftId] ?? [];
      const seen = new Set(current.map((f) => `${f.name}:${f.size}`));
      return {
        ...prev,
        [draftId]: [...current, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))],
      };
    });
  }

  function removeAttachment(draftId: string, index: number) {
    setFilesByDraft((prev) => ({
      ...prev,
      [draftId]: (prev[draftId] ?? []).filter((_, i) => i !== index),
    }));
  }

  function clearAttachments(draftId: string) {
    setFilesByDraft((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
  }

  function openSendConfirm(draftId: string) {
    setSendError(null);
    setConfirmDraftId(draftId);
  }

  function handleConfirmSend(draftId: string) {
    if (isTooLarge(draftId)) return;
    setSendError(null);
    startTransition(async () => {
      try {
        const attachments = await Promise.all(
          filesFor(draftId).map(async (f) => ({
            filename: f.name,
            mimeType: f.type || "application/octet-stream",
            contentBase64: await fileToBase64(f),
          }))
        );
        await approveDraft(draftId, attachments);
        setConfirmDraftId(null);
        clearAttachments(draftId);
        router.refresh();
      } catch {
        setSendError("No se pudo enviar el correo real. Verifica que la cuenta tenga el permiso gmail.send — puede que necesites reconectarla en Configuración.");
      }
    });
  }

  function handleDiscard(draftId: string) {
    startTransition(async () => {
      await discardDraft(draftId);
      clearAttachments(draftId);
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

      {drafts.map((draft) => {
        const attachments = filesFor(draft.id);
        const tooLarge = isTooLarge(draft.id);
        const showAttachmentPicker =
          isRealGmailAccount && draft.status === "PENDING_REVIEW" && editingDraftId !== draft.id;

        return (
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

            {showAttachmentPicker && (
              <div className="mt-3 border-t border-border pt-3">
                <input
                  ref={(el) => {
                    fileInputRefs.current[draft.id] = el;
                  }}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addAttachments(draft.id, e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[draft.id]?.click()}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Adjuntar archivos
                </button>
                {attachments.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {attachments.map((file, index) => (
                      <li
                        key={`${file.name}:${file.size}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                      >
                        <span className="truncate text-foreground">
                          {file.name} <span className="text-muted-foreground">· {formatFileSize(file.size)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(draft.id, index)}
                          disabled={isPending}
                          aria-label={`Quitar ${file.name}`}
                          className="shrink-0 text-muted-foreground hover:text-urgent"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {tooLarge && (
                  <p className="mt-1 text-xs text-urgent">
                    Los adjuntos suman {formatFileSize(totalBytesFor(draft.id))} — el máximo es{" "}
                    {formatFileSize(MAX_ATTACHMENTS_BYTES)}.
                  </p>
                )}
              </div>
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
                      <DialogTrigger render={<Button size="sm" disabled={isPending || tooLarge} />}>
                        Aprobar y enviar
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>¿Enviar esta respuesta?</DialogTitle>
                          <DialogDescription>
                            Se enviará un correo real a <strong>{recipientEmail}</strong> desde tu cuenta de
                            Gmail conectada
                            {attachments.length > 0
                              ? `, con ${attachments.length} archivo${attachments.length > 1 ? "s" : ""} adjunto${attachments.length > 1 ? "s" : ""}`
                              : ""}
                            . Esta acción no se puede deshacer.
                          </DialogDescription>
                        </DialogHeader>
                        {attachments.length > 0 && (
                          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                            {attachments.map((file) => (
                              <li key={`${file.name}:${file.size}`} className="flex items-center gap-1.5">
                                <Paperclip className="h-3 w-3" />
                                {file.name} · {formatFileSize(file.size)}
                              </li>
                            ))}
                          </ul>
                        )}
                        {sendError && <p className="text-sm text-urgent">{sendError}</p>}
                        <DialogFooter>
                          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                          <Button onClick={() => handleConfirmSend(draft.id)} disabled={isPending || tooLarge}>
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
        );
      })}
    </div>
  );
}

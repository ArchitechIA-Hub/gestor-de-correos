import { EMAIL_CATEGORY_FINANZAS } from "@/lib/scan/constants";

/**
 * "Buckets" de la bandeja: los destinos a los que se puede mover un correo.
 * Fuente única — la usan el menú "Mover a", la barra de selección múltiple y
 * las vistas del menú lateral. Para añadir una categoría nueva en el futuro
 * (p. ej. "Viajes") basta con una entrada aquí + su constante de `category`.
 */
export type InboxBucketId = "inbox" | "finanzas" | "marketing";

export type InboxBucket = {
  id: InboxBucketId;
  /** Texto visible. */
  label: string;
  /** Valor de `?view=` en /inbox, o undefined para la vista por defecto. */
  viewParam?: string;
  /** Valor de `Email.category` que representa este bucket, si aplica. */
  category: string | null;
  /** true si mover aquí archiva el correo como marketing (mecanismo distinto a `category`). */
  isMarketing: boolean;
};

export const INBOX_BUCKETS: InboxBucket[] = [
  { id: "inbox", label: "Bandeja priorizada", viewParam: undefined, category: null, isMarketing: false },
  { id: "finanzas", label: "Finanzas", viewParam: "finanzas", category: EMAIL_CATEGORY_FINANZAS, isMarketing: false },
  { id: "marketing", label: "Marketing ignorado", viewParam: "marketing", category: null, isMarketing: true },
];

export function getBucket(id: InboxBucketId): InboxBucket {
  const b = INBOX_BUCKETS.find((x) => x.id === id);
  if (!b) throw new Error(`Bucket desconocido: ${id}`);
  return b;
}

export function bucketFromView(view: string | undefined): InboxBucketId {
  if (view === "marketing") return "marketing";
  if (view === "finanzas") return "finanzas";
  return "inbox";
}

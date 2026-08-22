"use server";

import { revalidatePath } from "next/cache";
import { revertAuditEvent } from "@/lib/audit/revert";

export async function revertAudit(auditLogEntryId: string) {
  await revertAuditEvent(auditLogEntryId);

  revalidatePath("/audit");
  revalidatePath("/inbox");
  revalidatePath("/digest");
}

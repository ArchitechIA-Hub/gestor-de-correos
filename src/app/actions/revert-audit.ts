"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { revertAuditEvent } from "@/lib/audit/revert";

export async function revertAudit(auditLogEntryId: string) {
  const { organizationId } = await requireSession();
  await revertAuditEvent(organizationId, auditLogEntryId);

  revalidatePath("/audit");
  revalidatePath("/inbox");
  revalidatePath("/digest");
}

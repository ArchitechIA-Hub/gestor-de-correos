"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { getExtraConfig, type ExtraFlagKey } from "@/lib/extras";
import { recordAuditEvent } from "@/lib/audit/record";

export async function toggleExtra(key: ExtraFlagKey, enabled: boolean) {
  const { organizationId } = await requireSession();
  const config = await getExtraConfig(organizationId);
  const before = { [key]: config[key] };

  const updated = await prisma.extraConfig.update({
    where: { id: config.id },
    data: { [key]: enabled },
  });

  await recordAuditEvent({
    organizationId,
    actionType: "TOGGLE_EXTRA",
    entityType: "ExtraConfig",
    entityId: updated.id,
    payloadBefore: before,
    payloadAfter: { [key]: enabled },
    performedBy: "USER",
  });

  revalidatePath("/settings/extras");
  revalidatePath("/panel");
  revalidatePath("/audit");

  return updated;
}

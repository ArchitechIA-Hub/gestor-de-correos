"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getExtraConfig, type ExtraFlagKey } from "@/lib/extras";
import { recordAuditEvent } from "@/lib/audit/record";

export async function toggleExtra(key: ExtraFlagKey, enabled: boolean) {
  const config = await getExtraConfig();
  const before = { [key]: config[key] };

  const updated = await prisma.extraConfig.update({
    where: { id: config.id },
    data: { [key]: enabled },
  });

  await recordAuditEvent({
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

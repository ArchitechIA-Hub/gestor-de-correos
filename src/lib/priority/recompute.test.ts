import { describe, it, expect, beforeEach } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { recomputeOpenCommitmentPriorities } from "./recompute";

/**
 * Cubre el hallazgo de la revisión de confiabilidad: antes de este fix,
 * `recomputeOpenCommitmentPriorities` (el recálculo periódico del scheduler)
 * marcaba `isUrgent=true` cuando un compromiso cruzaba las <48h por el simple
 * paso del tiempo, pero nunca disparaba la alerta push ni WhatsApp — solo
 * `run-cycle.ts` (clasificación inicial) lo hacía. El invariante de
 * CLAUDE.md ("dispara notificación inmediata... incluso en Nivel 1") no
 * distingue el motivo por el que un correo se vuelve urgente.
 */

async function resetDb() {
  await prisma.whatsAppNotification.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.urgentAlert.deleteMany();
  await prisma.auditLogEntry.deleteMany();
  await prisma.draft.deleteMany();
  await prisma.commitment.deleteMany();
  await prisma.emailAttachment.deleteMany();
  await prisma.email.deleteMany();
  await prisma.sender.deleteMany();
  await prisma.mailAccount.deleteMany();
  await prisma.extraConfig.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let organizationId: string;
let emailId: string;
let commitmentId: string;

async function seed(whatsappEnabled: boolean) {
  const organization = await prisma.organization.create({ data: { name: "Org de prueba" } });
  organizationId = organization.id;
  await prisma.extraConfig.create({ data: { organizationId, whatsappEnabled } });

  const sender = await prisma.sender.create({
    data: { organizationId, email: "remitente@test.local", name: "Remitente de Prueba" },
  });
  const mailAccount = await prisma.mailAccount.create({
    data: { organizationId, emailAddress: "cuenta@test.local", label: "Cuenta de prueba" },
  });
  const email = await prisma.email.create({
    data: {
      organizationId,
      senderId: sender.id,
      mailAccountId: mailAccount.id,
      threadId: "thread-1",
      subject: "Asunto de prueba",
      rawBody: "Cuerpo del correo de prueba",
      receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      status: "CLASSIFIED",
      priorityScore: 0.1,
      isUrgent: false,
    },
  });
  emailId = email.id;

  const commitment = await prisma.commitment.create({
    data: {
      emailId: email.id,
      description: "Compromiso de prueba",
      // 10h en el futuro: dentro de la ventana <48h (URGENT_THRESHOLD_HOURS).
      dueAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
      sourceExcerpt: "excerpto de prueba",
      status: "PENDING",
    },
  });
  commitmentId = commitment.id;
}

beforeEach(resetDb);

describe("recomputeOpenCommitmentPriorities", () => {
  it("marca isUrgent=true y dispara la alerta push cuando un compromiso cruza <48h con el paso del tiempo", async () => {
    await seed(false);

    const { updated } = await recomputeOpenCommitmentPriorities(organizationId);
    expect(updated).toBe(1);

    const email = await prisma.email.findUniqueOrThrow({ where: { id: emailId } });
    expect(email.isUrgent).toBe(true);

    const alerts = await prisma.urgentAlert.findMany({ where: { emailId } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].commitmentId).toBe(commitmentId);

    const markUrgentEntries = await prisma.auditLogEntry.findMany({
      where: { entityId: emailId, actionType: "MARK_URGENT" },
    });
    expect(markUrgentEntries).toHaveLength(1);
  });

  it("también envía WhatsApp si el extra está activo", async () => {
    await seed(true);

    await recomputeOpenCommitmentPriorities(organizationId);

    const notifications = await prisma.whatsAppNotification.findMany({ where: { commitmentId } });
    expect(notifications).toHaveLength(1);
  });

  it("no envía WhatsApp si el extra está desactivado", async () => {
    await seed(false);

    await recomputeOpenCommitmentPriorities(organizationId);

    const notifications = await prisma.whatsAppNotification.findMany({ where: { commitmentId } });
    expect(notifications).toHaveLength(0);
  });

  it("no vuelve a alertar en una segunda pasada si isUrgent ya era true", async () => {
    await seed(false);
    await recomputeOpenCommitmentPriorities(organizationId);

    // Una segunda pasada puede seguir reportando `updated` (priorityScore
    // decae con el tiempo aunque isUrgent no cambie) — lo que NO debe pasar
    // es una segunda alerta para el mismo compromiso.
    await recomputeOpenCommitmentPriorities(organizationId);

    const alerts = await prisma.urgentAlert.findMany({ where: { emailId } });
    expect(alerts).toHaveLength(1); // sigue siendo solo la primera
  });
});

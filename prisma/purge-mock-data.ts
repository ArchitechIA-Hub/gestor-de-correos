import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";

/**
 * Borra toda la data sintética/dummy (cuentas MailAccount con provider
 * distinto de "gmail" -- el seed original de prisma/seed.ts y lo generado
 * por devSeedBacklog) y todo lo que cuelga de ella, en orden FK-safe. No
 * toca ninguna cuenta real (provider="gmail") ni sus correos/compromisos/
 * borradores/auditoría.
 */
async function main() {
  const mockAccounts = await prisma.mailAccount.findMany({
    where: { provider: { not: "gmail" } },
    select: { id: true },
  });
  const mockAccountIds = mockAccounts.map((a) => a.id);

  if (mockAccountIds.length === 0) {
    console.log("No hay cuentas mock que borrar.");
    return;
  }

  const mockEmails = await prisma.email.findMany({
    where: { mailAccountId: { in: mockAccountIds } },
    select: { id: true },
  });
  const mockEmailIds = mockEmails.map((e) => e.id);

  const mockCommitments = await prisma.commitment.findMany({
    where: { emailId: { in: mockEmailIds } },
    select: { id: true },
  });
  const mockCommitmentIds = mockCommitments.map((c) => c.id);

  const mockDrafts = await prisma.draft.findMany({
    where: { emailId: { in: mockEmailIds } },
    select: { id: true },
  });
  const mockDraftIds = mockDrafts.map((d) => d.id);

  const mockUrgentAlerts = await prisma.urgentAlert.findMany({
    where: { emailId: { in: mockEmailIds } },
    select: { id: true },
  });
  const mockUrgentAlertIds = mockUrgentAlerts.map((u) => u.id);

  const mockWhatsAppNotifications = await prisma.whatsAppNotification.findMany({
    where: { commitmentId: { in: mockCommitmentIds } },
    select: { id: true },
  });
  const mockWhatsAppIds = mockWhatsAppNotifications.map((w) => w.id);

  console.log(
    `Borrando: ${mockAccountIds.length} cuentas mock, ${mockEmailIds.length} correos, ` +
      `${mockCommitmentIds.length} compromisos, ${mockDraftIds.length} borradores, ` +
      `${mockUrgentAlertIds.length} alertas urgentes, ${mockWhatsAppIds.length} notificaciones WhatsApp.`
  );

  await prisma.auditLogEntry.deleteMany({
    where: {
      OR: [
        { entityType: "Email", entityId: { in: mockEmailIds } },
        { entityType: "Commitment", entityId: { in: mockCommitmentIds } },
        { entityType: "Draft", entityId: { in: mockDraftIds } },
        { entityType: "MailAccount", entityId: { in: mockAccountIds } },
        { entityType: "UrgentAlert", entityId: { in: mockUrgentAlertIds } },
        { entityType: "WhatsAppNotification", entityId: { in: mockWhatsAppIds } },
      ],
    },
  });

  await prisma.whatsAppNotification.deleteMany({ where: { commitmentId: { in: mockCommitmentIds } } });
  await prisma.calendarEvent.deleteMany({ where: { commitmentId: { in: mockCommitmentIds } } });
  await prisma.urgentAlert.deleteMany({ where: { emailId: { in: mockEmailIds } } });
  await prisma.draft.deleteMany({ where: { emailId: { in: mockEmailIds } } });
  await prisma.commitment.deleteMany({ where: { emailId: { in: mockEmailIds } } });
  await prisma.emailAttachment.deleteMany({ where: { emailId: { in: mockEmailIds } } });
  await prisma.email.deleteMany({ where: { id: { in: mockEmailIds } } });
  await prisma.mailAccount.deleteMany({ where: { id: { in: mockAccountIds } } });

  const orphanSenders = await prisma.sender.deleteMany({ where: { emails: { none: {} } } });

  console.log(`Listo. Remitentes huérfanos borrados: ${orphanSenders.count}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { MOCK_SENDERS } from "../src/lib/mock/senders";
import { MOCK_ACCOUNTS } from "../src/lib/mock/accounts";
import { generateMockEmails } from "../src/lib/mock/generate-emails";
import { computePriorityScore, isUrgentByDeadline } from "../src/lib/priority/engine";

const NOW = new Date();

// Del total de correos generados, los más recientes quedan sin clasificar
// (backlog real, nivel de servicio 1 = Ligero) y el resto simula un historial
// de correos ya escaneados en ciclos anteriores.
const TOTAL_EMAILS = 180;
const UNCLASSIFIED_COUNT = 60;

async function main() {
  // Reutiliza la primera Organization si ya existe (p. ej. la creada por
  // prisma/backfill-organization.ts) en vez de crear una segunda por
  // accidente al re-sembrar sobre una base ya multi-tenant.
  const organization =
    (await prisma.organization.findFirst()) ??
    (await prisma.organization.create({ data: { name: "Daniel Martínez" } }));

  console.log("Sembrando remitentes...");
  const senderRecords = new Map<string, string>(); // email -> id
  for (const sender of MOCK_SENDERS) {
    const record = await prisma.sender.upsert({
      where: { organizationId_email: { organizationId: organization.id, email: sender.email } },
      update: {},
      create: {
        organizationId: organization.id,
        email: sender.email,
        name: sender.name,
        isVip: sender.isVip,
        vipReason: sender.vipReason,
        organization: sender.organization,
      },
    });
    senderRecords.set(sender.email, record.id);
  }

  console.log("Sembrando cuentas de correo...");
  const accountRecords = new Map<string, string>(); // emailAddress -> id
  for (const account of MOCK_ACCOUNTS) {
    const record = await prisma.mailAccount.upsert({
      where: { emailAddress: account.emailAddress },
      update: {},
      create: { organizationId: organization.id, emailAddress: account.emailAddress, label: account.label },
    });
    accountRecords.set(account.emailAddress, record.id);
  }

  console.log("Configuración de extras por defecto...");
  await prisma.extraConfig.deleteMany({ where: { organizationId: organization.id } });
  await prisma.extraConfig.create({ data: { organizationId: organization.id } });

  console.log(`Generando ${TOTAL_EMAILS} correos de ejemplo...`);
  const generated = generateMockEmails(TOTAL_EMAILS, NOW);

  let urgentCasesSeeded = 0;

  let marketingCasesSeeded = 0;

  for (let i = 0; i < generated.length; i++) {
    const item = generated[i];
    const senderId = senderRecords.get(item.sender.email)!;
    const mailAccountId = accountRecords.get(item.account.emailAddress)!;
    const isUnclassified = i < UNCLASSIFIED_COUNT;
    const isMarketing = !isUnclassified && item.category === "MARKETING";

    const nearestDueAt = item.commitments
      .map((c) => c.dueAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    const priorityScore =
      isUnclassified || isMarketing
        ? 0
        : computePriorityScore(
            { id: item.threadId, receivedAt: item.receivedAt, isVip: item.sender.isVip, nearestDueAt },
            NOW
          );
    const isUrgent = isUnclassified || isMarketing ? false : isUrgentByDeadline(nearestDueAt, NOW);
    if (isUrgent) urgentCasesSeeded++;
    if (isMarketing) marketingCasesSeeded++;

    const email = await prisma.email.create({
      data: {
        organizationId: organization.id,
        senderId,
        mailAccountId,
        threadId: item.threadId,
        subject: item.subject,
        rawBody: item.body,
        receivedAt: item.receivedAt,
        status: isUnclassified ? "UNCLASSIFIED" : isMarketing ? "ARCHIVED" : "CLASSIFIED",
        priorityScore,
        isUrgent,
        isMarketing,
        marketingReason: isMarketing ? "Contenido promocional/newsletter, sin acción requerida" : null,
        classifiedAt: isUnclassified ? null : NOW,
      },
    });

    if (isMarketing) {
      const before = JSON.stringify({ status: "UNCLASSIFIED", isMarketing: false });
      const after = JSON.stringify({ status: "ARCHIVED", isMarketing: true });
      await prisma.auditLogEntry.create({
        data: {
          organizationId: organization.id,
          actionType: "CLASSIFY",
          entityType: "Email",
          entityId: email.id,
          payloadBefore: before,
          payloadAfter: after,
          performedBy: "SYSTEM",
          reversible: true,
        },
      });
      await prisma.auditLogEntry.create({
        data: {
          organizationId: organization.id,
          actionType: "MARK_MARKETING",
          entityType: "Email",
          entityId: email.id,
          payloadBefore: before,
          payloadAfter: after,
          performedBy: "SYSTEM",
          reversible: true,
        },
      });
    } else if (!isUnclassified) {
      await prisma.auditLogEntry.create({
        data: {
          organizationId: organization.id,
          actionType: "CLASSIFY",
          entityType: "Email",
          entityId: email.id,
          payloadBefore: JSON.stringify({ status: "UNCLASSIFIED" }),
          payloadAfter: JSON.stringify({ status: "CLASSIFIED", priorityScore, isUrgent }),
          performedBy: "SYSTEM",
          reversible: true,
        },
      });

      for (const commitment of item.commitments) {
        const created = await prisma.commitment.create({
          data: {
            emailId: email.id,
            description: commitment.description,
            dueAt: commitment.dueAt,
            confidence: commitment.confidence,
            sourceExcerpt: commitment.sourceExcerpt,
            status: commitment.dueAt && commitment.dueAt.getTime() < NOW.getTime() ? "OVERDUE" : "PENDING",
            detectedByAI: true,
          },
        });

        await prisma.auditLogEntry.create({
          data: {
            organizationId: organization.id,
            actionType: "DETECT_COMMITMENT",
            entityType: "Commitment",
            entityId: created.id,
            payloadAfter: JSON.stringify(commitment),
            performedBy: "SYSTEM",
            reversible: true,
          },
        });
      }

      if (isUrgent) {
        await prisma.auditLogEntry.create({
          data: {
            organizationId: organization.id,
            actionType: "MARK_URGENT",
            entityType: "Email",
            entityId: email.id,
            payloadBefore: JSON.stringify({ isUrgent: false }),
            payloadAfter: JSON.stringify({ isUrgent: true, reason: "vencimiento <48h" }),
            performedBy: "SYSTEM",
            reversible: true,
          },
        });
      }
    }
  }

  console.log(
    `Listo. Backlog sin clasificar: ${UNCLASSIFIED_COUNT}. Casos urgentes (<48h) sembrados: ${urgentCasesSeeded}. Marketing ignorado sembrado: ${marketingCasesSeeded}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

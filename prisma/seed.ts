import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { MOCK_SENDERS } from "../src/lib/mock/senders";
import { generateMockEmails } from "../src/lib/mock/generate-emails";
import { computePriorityScore, isUrgentByDeadline } from "../src/lib/priority/engine";

const NOW = new Date();

// Del total de correos generados, los más recientes quedan sin clasificar
// (backlog real, nivel de servicio 1 = Ligero) y el resto simula un historial
// de correos ya escaneados en ciclos anteriores.
const TOTAL_EMAILS = 180;
const UNCLASSIFIED_COUNT = 60;

async function main() {
  console.log("Sembrando remitentes...");
  const senderRecords = new Map<string, string>(); // email -> id
  for (const sender of MOCK_SENDERS) {
    const record = await prisma.sender.upsert({
      where: { email: sender.email },
      update: {},
      create: {
        email: sender.email,
        name: sender.name,
        isVip: sender.isVip,
        vipReason: sender.vipReason,
        organization: sender.organization,
      },
    });
    senderRecords.set(sender.email, record.id);
  }

  console.log("Configuración de extras por defecto...");
  await prisma.extraConfig.deleteMany();
  await prisma.extraConfig.create({ data: {} });

  console.log(`Generando ${TOTAL_EMAILS} correos de ejemplo...`);
  const generated = generateMockEmails(TOTAL_EMAILS, NOW);

  let urgentCasesSeeded = 0;

  for (let i = 0; i < generated.length; i++) {
    const item = generated[i];
    const senderId = senderRecords.get(item.sender.email)!;
    const isUnclassified = i < UNCLASSIFIED_COUNT;

    const nearestDueAt = item.commitments
      .map((c) => c.dueAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    const priorityScore = isUnclassified
      ? 0
      : computePriorityScore(
          { id: item.threadId, receivedAt: item.receivedAt, isVip: item.sender.isVip, nearestDueAt },
          NOW
        );
    const isUrgent = isUnclassified ? false : isUrgentByDeadline(nearestDueAt, NOW);
    if (isUrgent) urgentCasesSeeded++;

    const email = await prisma.email.create({
      data: {
        senderId,
        threadId: item.threadId,
        subject: item.subject,
        rawBody: item.body,
        receivedAt: item.receivedAt,
        status: isUnclassified ? "UNCLASSIFIED" : "CLASSIFIED",
        priorityScore,
        isUrgent,
        classifiedAt: isUnclassified ? null : NOW,
      },
    });

    if (!isUnclassified) {
      await prisma.auditLogEntry.create({
        data: {
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

  console.log(`Listo. Backlog sin clasificar: ${UNCLASSIFIED_COUNT}. Casos urgentes (<48h) sembrados: ${urgentCasesSeeded}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

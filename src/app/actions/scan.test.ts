import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai/extract-commitments", () => ({ extractCommitments: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { extractCommitments } from "@/lib/ai/extract-commitments";
import { scan } from "./scan";

const mockedExtractCommitments = vi.mocked(extractCommitments);

function isoHoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function resetDb() {
  await prisma.whatsAppNotification.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.urgentAlert.deleteMany();
  await prisma.auditLogEntry.deleteMany();
  await prisma.draft.deleteMany();
  await prisma.commitment.deleteMany();
  await prisma.email.deleteMany();
  await prisma.sender.deleteMany();
  await prisma.mailAccount.deleteMany();
  await prisma.extraConfig.deleteMany();
}

async function seedUnclassifiedEmail(overrides: { isVip?: boolean } = {}) {
  const account = await prisma.mailAccount.create({
    data: { emailAddress: "cuenta@test.local", label: "Cuenta de prueba" },
  });
  const sender = await prisma.sender.create({
    data: { email: "remitente@test.local", name: "Remitente de Prueba", isVip: overrides.isVip ?? false },
  });
  return prisma.email.create({
    data: {
      senderId: sender.id,
      mailAccountId: account.id,
      threadId: "thread-1",
      subject: "Asunto de prueba",
      rawBody: "Cuerpo del correo de prueba",
      receivedAt: new Date(),
      status: "UNCLASSIFIED",
    },
  });
}

beforeEach(async () => {
  await resetDb();
  mockedExtractCommitments.mockReset();
});

describe("scan", () => {
  it("archiva un correo de marketing sin extraer compromisos", async () => {
    await seedUnclassifiedEmail();
    mockedExtractCommitments.mockResolvedValue({
      summary: "Resumen de prueba.",
      isMarketing: true,
      marketingReason: "Newsletter promocional",
      commitments: [],
    });

    const result = await scan();

    expect(result.marketingDetected).toBe(1);
    expect(result.commitmentsDetected).toBe(0);

    const email = await prisma.email.findFirstOrThrow();
    expect(email.status).toBe("ARCHIVED");
    expect(email.isMarketing).toBe(true);

    const auditTypes = (await prisma.auditLogEntry.findMany()).map((a) => a.actionType);
    expect(auditTypes).toEqual(expect.arrayContaining(["CLASSIFY", "MARK_MARKETING"]));
  });

  it("clasifica un correo con un compromiso lejano sin marcarlo urgente", async () => {
    await seedUnclassifiedEmail();
    mockedExtractCommitments.mockResolvedValue({
      summary: "Resumen de prueba.",
      isMarketing: false,
      marketingReason: null,
      commitments: [
        {
          description: "Enviar propuesta final",
          dueDateISO: isoHoursFromNow(24 * 30),
          isExplicitDate: true,
          confidence: "HIGH",
          sourceExcerpt: "en un mes",
        },
      ],
    });

    const result = await scan();

    expect(result.commitmentsDetected).toBe(1);
    expect(result.urgentDetected).toBe(0);

    const email = await prisma.email.findFirstOrThrow();
    expect(email.status).toBe("CLASSIFIED");
    expect(email.isUrgent).toBe(false);

    const commitment = await prisma.commitment.findFirstOrThrow();
    expect(commitment.status).toBe("PENDING");

    expect(await prisma.urgentAlert.count()).toBe(0);
  });

  it("marca urgente y crea la alerta push cuando el compromiso vence en menos de 48h, sin importar los extras", async () => {
    await seedUnclassifiedEmail();
    mockedExtractCommitments.mockResolvedValue({
      summary: "Resumen de prueba.",
      isMarketing: false,
      marketingReason: null,
      commitments: [
        {
          description: "Confirmar la propuesta",
          dueDateISO: isoHoursFromNow(5),
          isExplicitDate: true,
          confidence: "HIGH",
          sourceExcerpt: "antes de mañana",
        },
      ],
    });

    const result = await scan();
    expect(result.urgentDetected).toBe(1);

    const email = await prisma.email.findFirstOrThrow();
    expect(email.isUrgent).toBe(true);

    expect(await prisma.urgentAlert.count()).toBe(1);
    const auditTypes = (await prisma.auditLogEntry.findMany()).map((a) => a.actionType);
    expect(auditTypes).toContain("MARK_URGENT");

    // Sin extras activados no debe crear ni evento de calendario ni notificación de WhatsApp.
    expect(await prisma.calendarEvent.count()).toBe(0);
    expect(await prisma.whatsAppNotification.count()).toBe(0);
  });

  it("crea un evento de calendario solo cuando el extra calendarEnabled está activo", async () => {
    await prisma.extraConfig.create({ data: { calendarEnabled: true } });
    await seedUnclassifiedEmail();
    mockedExtractCommitments.mockResolvedValue({
      summary: "Resumen de prueba.",
      isMarketing: false,
      marketingReason: null,
      commitments: [
        {
          description: "Enviar el reporte mensual",
          dueDateISO: isoHoursFromNow(24 * 10),
          isExplicitDate: true,
          confidence: "HIGH",
          sourceExcerpt: "en 10 días",
        },
      ],
    });

    await scan();

    const events = await prisma.calendarEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Enviar el reporte mensual");

    const auditTypes = (await prisma.auditLogEntry.findMany()).map((a) => a.actionType);
    expect(auditTypes).toContain("CREATE_CALENDAR_EVENT");
  });

  it("envía la notificación de WhatsApp al compromiso más próximo solo cuando whatsappEnabled está activo y el correo queda urgente", async () => {
    await prisma.extraConfig.create({ data: { whatsappEnabled: true } });
    await seedUnclassifiedEmail();
    mockedExtractCommitments.mockResolvedValue({
      summary: "Resumen de prueba.",
      isMarketing: false,
      marketingReason: null,
      commitments: [
        {
          description: "Aprobar el presupuesto",
          dueDateISO: isoHoursFromNow(3),
          isExplicitDate: true,
          confidence: "HIGH",
          sourceExcerpt: "hoy mismo",
        },
      ],
    });

    await scan();

    const notifications = await prisma.whatsAppNotification.findMany();
    expect(notifications).toHaveLength(1);

    const auditTypes = (await prisma.auditLogEntry.findMany()).map((a) => a.actionType);
    expect(auditTypes).toContain("SEND_WHATSAPP_NOTIFICATION");
  });

  it("no crea eventos de calendario ni notificaciones de WhatsApp si los extras están apagados por defecto", async () => {
    await seedUnclassifiedEmail();
    mockedExtractCommitments.mockResolvedValue({
      summary: "Resumen de prueba.",
      isMarketing: false,
      marketingReason: null,
      commitments: [
        {
          description: "Aprobar el presupuesto",
          dueDateISO: isoHoursFromNow(3),
          isExplicitDate: true,
          confidence: "HIGH",
          sourceExcerpt: "hoy mismo",
        },
      ],
    });

    await scan();

    expect(await prisma.calendarEvent.count()).toBe(0);
    expect(await prisma.whatsAppNotification.count()).toBe(0);
  });

  it("marca un compromiso como OVERDUE si su fecha ya pasó al momento de detectarlo", async () => {
    await seedUnclassifiedEmail();
    mockedExtractCommitments.mockResolvedValue({
      summary: "Resumen de prueba.",
      isMarketing: false,
      marketingReason: null,
      commitments: [
        {
          description: "Entregar el informe atrasado",
          dueDateISO: isoHoursFromNow(-10),
          isExplicitDate: true,
          confidence: "MEDIUM",
          sourceExcerpt: "hace unos días",
        },
      ],
    });

    await scan();

    const commitment = await prisma.commitment.findFirstOrThrow();
    expect(commitment.status).toBe("OVERDUE");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

// Ambas orgs de estos tests tienen backlog 0 (nunca hay UNCLASSIFIED que
// clasificar), así que extractCommitments nunca se llama de verdad — pero
// igual hay que mockearlo: importar route.ts arrastra runScanCycle →
// extract-commitments → ai/client.ts, que instancia `new OpenAI()` al cargar
// el módulo y explota sin OPENAI_API_KEY en el entorno de test.
vi.mock("@/lib/ai/extract-commitments", () => ({ extractCommitments: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { POST } from "./route";

/**
 * Verificación de la Fase 4 (scheduler por organización, ver
 * decision_multitenant_organization_user en memoria): el endpoint que llama
 * el scheduler (src/lib/scheduler/auto-scan.ts) itera TODAS las
 * organizaciones activas, pero cada una solo se re-escanea cuando a ELLA le
 * toca según su propio ScanCycleLog más reciente — nunca en bloque ni con una
 * cadencia compartida.
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
  await prisma.scanCycleLog.deleteMany();
  await prisma.extraConfig.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

function request(): Request {
  return new Request("http://localhost/api/scan", { method: "POST" });
}

beforeEach(async () => {
  delete process.env.INTERNAL_SCAN_SECRET;
  await resetDb();
});

describe("POST /api/scan", () => {
  it("procesa una organización sin ScanCycleLog previo (siempre le toca) y crea su primer log", async () => {
    const org = await prisma.organization.create({ data: { name: "Sin ciclos previos" } });

    const response = await POST(request());
    const body = await response.json();

    expect(body.organizations.map((r: { organizationId: string }) => r.organizationId)).toEqual([org.id]);

    const logs = await prisma.scanCycleLog.findMany({ where: { organizationId: org.id } });
    expect(logs).toHaveLength(1);
  });

  it("salta una organización cuyo último ciclo fue reciente (backlog 0 = Nivel 1, cada 6h)", async () => {
    const org = await prisma.organization.create({ data: { name: "Recién escaneada" } });
    await prisma.scanCycleLog.create({
      data: {
        organizationId: org.id,
        emailsImported: 0,
        emailsScanned: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        serviceLevel: 1,
        backlogCount: 0,
        startedAt: new Date(), // "ahora mismo" — muy lejos de los 360 min de Nivel 1
      },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(body.organizations).toEqual([]);

    const logs = await prisma.scanCycleLog.findMany({ where: { organizationId: org.id } });
    expect(logs).toHaveLength(1); // sigue siendo solo el que sembramos, no se creó uno nuevo
  });

  it("dos organizaciones con cadencias distintas se evalúan de forma independiente en el mismo tick", async () => {
    const due = await prisma.organization.create({ data: { name: "Le toca" } });
    const notDue = await prisma.organization.create({ data: { name: "No le toca" } });
    await prisma.scanCycleLog.create({
      data: {
        organizationId: notDue.id,
        emailsImported: 0,
        emailsScanned: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        serviceLevel: 1,
        backlogCount: 0,
        startedAt: new Date(),
      },
    });

    const response = await POST(request());
    const body = await response.json();

    const processedIds = body.organizations.map((r: { organizationId: string }) => r.organizationId);
    expect(processedIds).toContain(due.id);
    expect(processedIds).not.toContain(notDue.id);
  });

  it("responde 401 si INTERNAL_SCAN_SECRET está fijado y el header no coincide", async () => {
    process.env.INTERNAL_SCAN_SECRET = "correcto";
    const response = await POST(request());
    expect(response.status).toBe(401);
  });
});

import { describe, it, expect, beforeEach } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { POST } from "./route";

/**
 * Verificación de la Fase 4 (scheduler por organización, ver
 * decision_multitenant_organization_user en memoria): el endpoint que llama
 * el scheduler (src/lib/scheduler/auto-digest.ts) itera TODAS las
 * organizaciones activas, pero cada una solo se re-evalúa según SU PROPIO
 * último envío (AuditLogEntry SEND_DIGEST más reciente) — no en bloque.
 * Ninguna organización de estos tests tiene una cuenta Gmail conectada ni un
 * destinatario configurado a propósito: lo que importa aquí es si el
 * endpoint decide procesarla o saltarla, no si el envío en sí tiene éxito
 * (eso ya lo prueba send-digest-for-org indirectamente al fallar con un
 * mensaje claro).
 */

async function resetDb() {
  // Orden FK-safe completo (no solo las tablas que estos tests siembran):
  // test.db es compartida entre archivos de test dentro de la misma corrida
  // (fileParallelism: false, pero sin reset entre archivos), así que un
  // `organization.deleteMany()` puede chocar con filas que dejó OTRO archivo
  // de test si no se limpia todo lo que cuelga de Organization.
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
  await prisma.appSettings.deleteMany();
  await prisma.extraConfig.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

function request(): Request {
  return new Request("http://localhost/api/send-digest", { method: "POST" });
}

beforeEach(async () => {
  delete process.env.INTERNAL_SCAN_SECRET;
  await resetDb();
});

describe("POST /api/send-digest", () => {
  it("procesa una organización sin envíos previos (siempre le toca)", async () => {
    const org = await prisma.organization.create({ data: { name: "Nunca se le envió el informe" } });

    const response = await POST(request());
    const body = await response.json();

    const processed = body.organizations.find((r: { organizationId: string }) => r.organizationId === org.id);
    expect(processed).toBeDefined();
    // Sin cuenta Gmail conectada ni destinatario configurado: se recogió
    // como "le tocaba", pero el envío en sí falla — lo que importa aquí es
    // que SÍ entró a intentarlo, no que haya tenido éxito.
    expect(processed.error).toBeTruthy();
  });

  it("salta una organización a la que ya se le envió el informe esta semana", async () => {
    const org = await prisma.organization.create({ data: { name: "Ya se le envió" } });
    await prisma.auditLogEntry.create({
      data: {
        organizationId: org.id,
        actionType: "SEND_DIGEST",
        entityType: "Digest",
        entityId: "weekly-ya-enviado",
        performedBy: "SYSTEM",
        reversible: false,
        createdAt: new Date(),
      },
    });

    const response = await POST(request());
    const body = await response.json();

    const processedIds = body.organizations.map((r: { organizationId: string }) => r.organizationId);
    expect(processedIds).not.toContain(org.id);
  });

  it("dos organizaciones se evalúan de forma independiente en el mismo tick", async () => {
    const due = await prisma.organization.create({ data: { name: "Le toca" } });
    const notDue = await prisma.organization.create({ data: { name: "No le toca" } });
    await prisma.auditLogEntry.create({
      data: {
        organizationId: notDue.id,
        actionType: "SEND_DIGEST",
        entityType: "Digest",
        entityId: "weekly-ya-enviado",
        performedBy: "SYSTEM",
        reversible: false,
        createdAt: new Date(),
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

import { describe, it, expect, beforeEach } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { getRescuePlan } from "@/lib/priority/rescue";
import { getAnalyticsSnapshot } from "@/lib/analytics/metrics";
import { getUpcomingCalendarEvents } from "@/lib/calendar";
import { getRecentWhatsAppNotifications } from "@/lib/whatsapp";
import { getDigestData } from "@/lib/digest/get-digest-data";
import { getEmailAuditTrail } from "@/lib/audit/email-trail";
import { getActiveMailAccounts } from "@/lib/mail-accounts";
import { getUnreadUrgentAlerts, countUnreadUrgentAlerts } from "@/lib/alerts";

/**
 * Verificación de aislamiento multi-tenant (Fase 3 de
 * decision_multitenant_organization_user, ver memoria): dos organizaciones
 * con datos en paralelo, y cada función de lectura org-scoped debe devolver
 * SOLO lo suyo. Cubre en particular los dos leaks reales encontrados y
 * corregidos en esta misma sesión (getAnalyticsSnapshot y getRescuePlan
 * mezclaban compromisos/correos de todas las organizaciones).
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

type OrgBundle = {
  organizationId: string;
  emailId: string;
  commitmentId: string;
  mailAccountEmail: string;
};

async function seedOrgBundle(label: string, approvedAtHoursAfterReceived: number): Promise<OrgBundle> {
  const organization = await prisma.organization.create({ data: { name: `${label} org` } });
  const organizationId = organization.id;

  const sender = await prisma.sender.create({
    data: { organizationId, email: "vip@example.com", name: `${label} VIP`, isVip: true },
  });

  const mailAccountEmail = `${label.toLowerCase()}@mail.test`;
  const mailAccount = await prisma.mailAccount.create({
    data: { organizationId, emailAddress: mailAccountEmail, label: `${label} account` },
  });

  const receivedAt = new Date();
  const email = await prisma.email.create({
    data: {
      organizationId,
      senderId: sender.id,
      mailAccountId: mailAccount.id,
      threadId: `${label}-thread`,
      subject: `${label} subject`,
      rawBody: `${label} body`,
      receivedAt,
      status: "CLASSIFIED",
      priorityScore: 1,
      isUrgent: false,
    },
  });

  const commitment = await prisma.commitment.create({
    data: {
      emailId: email.id,
      description: `${label} commitment`,
      dueAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
      sourceExcerpt: `${label} excerpt`,
      status: "PENDING",
    },
  });

  await prisma.draft.create({
    data: {
      emailId: email.id,
      content: `${label} draft content`,
      status: "APPROVED",
      modelUsed: "test-model",
      approvedAt: new Date(receivedAt.getTime() + approvedAtHoursAfterReceived * 60 * 60 * 1000),
    },
  });

  await prisma.urgentAlert.create({
    data: {
      organizationId,
      emailId: email.id,
      commitmentId: commitment.id,
      message: `${label} alert`,
      dueAt: commitment.dueAt,
    },
  });

  await prisma.whatsAppNotification.create({
    data: { commitmentId: commitment.id, message: `${label} whatsapp` },
  });

  await prisma.calendarEvent.create({
    data: {
      commitmentId: commitment.id,
      title: `${label} calendar event`,
      start: new Date(Date.now() + 12 * 60 * 60 * 1000),
      provider: "mock",
      auditLogEntryId: "fake-audit-id",
    },
  });

  await prisma.auditLogEntry.create({
    data: {
      organizationId,
      actionType: "CLASSIFY",
      entityType: "Email",
      entityId: email.id,
      payloadAfter: JSON.stringify({ status: "CLASSIFIED" }),
      performedBy: "SYSTEM",
    },
  });

  // Segundo correo del mismo remitente VIP, sin borrador aprobado — es lo que
  // hace que `getDigestData` lo cuente como "VIP sin respuesta". El primer
  // correo ya tiene un borrador APPROVED (usado para el test de
  // avgResponseTimeHours), así que por sí solo no alcanzaría para probar la
  // sección de VIP sin respuesta.
  await prisma.email.create({
    data: {
      organizationId,
      senderId: sender.id,
      mailAccountId: mailAccount.id,
      threadId: `${label}-thread-2`,
      subject: `${label} unanswered subject`,
      rawBody: `${label} unanswered body`,
      receivedAt,
      status: "CLASSIFIED",
      priorityScore: 1,
      isUrgent: false,
    },
  });

  return { organizationId, emailId: email.id, commitmentId: commitment.id, mailAccountEmail };
}

let orgA: OrgBundle;
let orgB: OrgBundle;

beforeEach(async () => {
  await resetDb();
  orgA = await seedOrgBundle("OrgA", 2);
  orgB = await seedOrgBundle("OrgB", 10);
});

describe("aislamiento multi-tenant", () => {
  it("getRescuePlan solo devuelve compromisos de la organización pedida", async () => {
    const planA = await getRescuePlan(orgA.organizationId);
    expect(planA.map((c) => c.id)).toEqual([orgA.commitmentId]);
    expect(planA.map((c) => c.id)).not.toContain(orgB.commitmentId);

    const planB = await getRescuePlan(orgB.organizationId);
    expect(planB.map((c) => c.id)).toEqual([orgB.commitmentId]);
  });

  it("getAnalyticsSnapshot no mezcla correos ni tiempos de respuesta entre organizaciones", async () => {
    const snapshotA = await getAnalyticsSnapshot(orgA.organizationId);
    const totalPendingA = snapshotA.pendingByAgeBucket.reduce((sum, b) => sum + b.count, 0);
    expect(totalPendingA).toBe(2);
    expect(snapshotA.avgResponseTimeHours).toBeCloseTo(2, 1);

    const snapshotB = await getAnalyticsSnapshot(orgB.organizationId);
    const totalPendingB = snapshotB.pendingByAgeBucket.reduce((sum, b) => sum + b.count, 0);
    expect(totalPendingB).toBe(2);
    expect(snapshotB.avgResponseTimeHours).toBeCloseTo(10, 1);
  });

  it("getUpcomingCalendarEvents solo devuelve eventos de la organización pedida", async () => {
    const eventsA = await getUpcomingCalendarEvents(orgA.organizationId);
    expect(eventsA).toHaveLength(1);
    expect(eventsA[0].title).toBe("OrgA calendar event");

    const eventsB = await getUpcomingCalendarEvents(orgB.organizationId);
    expect(eventsB).toHaveLength(1);
    expect(eventsB[0].title).toBe("OrgB calendar event");
  });

  it("getRecentWhatsAppNotifications solo devuelve notificaciones de la organización pedida", async () => {
    const notificationsA = await getRecentWhatsAppNotifications(orgA.organizationId);
    expect(notificationsA).toHaveLength(1);
    expect(notificationsA[0].message).toBe("OrgA whatsapp");

    const notificationsB = await getRecentWhatsAppNotifications(orgB.organizationId);
    expect(notificationsB).toHaveLength(1);
    expect(notificationsB[0].message).toBe("OrgB whatsapp");
  });

  it("getDigestData solo cuenta correos, compromisos y VIP de la organización pedida", async () => {
    const digestA = await getDigestData(orgA.organizationId, "weekly");
    expect(digestA.emails.map((e) => e.subject).sort()).toEqual(["OrgA subject", "OrgA unanswered subject"].sort());
    expect(digestA.activeCommitments).toBe(1);
    expect(digestA.vipSendersUnanswered).toHaveLength(1);
    expect(digestA.vipSendersUnanswered[0].name).toBe("OrgA VIP");
  });

  it("getActiveMailAccounts solo devuelve cuentas de la organización pedida", async () => {
    const accountsA = await getActiveMailAccounts(orgA.organizationId);
    expect(accountsA.map((a) => a.emailAddress)).toEqual([orgA.mailAccountEmail]);
  });

  it("getUnreadUrgentAlerts/countUnreadUrgentAlerts no mezclan alertas entre organizaciones", async () => {
    const alertsA = await getUnreadUrgentAlerts(orgA.organizationId);
    expect(alertsA).toHaveLength(1);
    expect(alertsA[0].message).toBe("OrgA alert");
    expect(await countUnreadUrgentAlerts(orgA.organizationId)).toBe(1);
  });

  it("getEmailAuditTrail ignora un emailId real que pertenece a OTRA organización", async () => {
    const trailOwn = await getEmailAuditTrail(orgA.organizationId, orgA.emailId);
    expect(trailOwn.length).toBeGreaterThan(0);

    // orgA.emailId es válido, pero pertenece a orgB — pedirlo con el
    // organizationId de orgA debe tratarse como si no existiera, nunca
    // devolver el historial ajeno.
    const trailCrossOrg = await getEmailAuditTrail(orgA.organizationId, orgB.emailId);
    expect(trailCrossOrg).toEqual([]);
  });
});

/*
  Warnings:

  - Made the column `organizationId` on table `AppSettings` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `AuditLogEntry` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `Email` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `ExtraConfig` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `MailAccount` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `ScanCycleLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `Sender` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `UrgentAlert` required. This step will fail if there are existing NULL values in that column.

*/
-- Red de seguridad (editado a mano, no autogenerado): el flujo normal es
-- correr `prisma/backfill-organization.ts` entre esta migración y la
-- anterior, así que en dev.db/producción esto no debe encontrar ninguna fila
-- NULL. Pero la suite de tests (vitest.global-setup.ts) reconstruye la BD
-- desde cero repitiendo TODO el historial de migraciones, incluida
-- `20260824020812_add_mail_accounts_and_marketing_filter`, que inserta una
-- fila legacy ("legacy-default-account") de una migración de datos muy
-- anterior al concepto de Organization. Sin este guard, esa fila huérfana
-- rompería el `NOT NULL` de abajo en cada corrida de tests. Es un no-op en
-- cualquier BD donde el backfill ya corrió (cero filas NULL restantes).
INSERT OR IGNORE INTO "Organization" ("id", "name") VALUES ('legacy-fallback-org', 'Legacy (backfill automático de migración)');
UPDATE "MailAccount" SET "organizationId" = 'legacy-fallback-org' WHERE "organizationId" IS NULL;
UPDATE "Sender" SET "organizationId" = 'legacy-fallback-org' WHERE "organizationId" IS NULL;
UPDATE "Email" SET "organizationId" = 'legacy-fallback-org' WHERE "organizationId" IS NULL;
UPDATE "AuditLogEntry" SET "organizationId" = 'legacy-fallback-org' WHERE "organizationId" IS NULL;
UPDATE "ScanCycleLog" SET "organizationId" = 'legacy-fallback-org' WHERE "organizationId" IS NULL;
UPDATE "UrgentAlert" SET "organizationId" = 'legacy-fallback-org' WHERE "organizationId" IS NULL;
UPDATE "AppSettings" SET "organizationId" = 'legacy-fallback-org' WHERE "organizationId" IS NULL;
UPDATE "ExtraConfig" SET "organizationId" = 'legacy-fallback-org' WHERE "organizationId" IS NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "digestRecipientEmail" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AppSettings" ("digestRecipientEmail", "id", "organizationId", "timeZone", "updatedAt") SELECT "digestRecipientEmail", "id", "organizationId", "timeZone", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
CREATE UNIQUE INDEX "AppSettings_organizationId_key" ON "AppSettings"("organizationId");
CREATE TABLE "new_AuditLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payloadBefore" TEXT,
    "payloadAfter" TEXT,
    "performedBy" TEXT NOT NULL DEFAULT 'SYSTEM',
    "reversible" BOOLEAN NOT NULL DEFAULT true,
    "revertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLogEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AuditLogEntry" ("actionType", "createdAt", "entityId", "entityType", "id", "organizationId", "payloadAfter", "payloadBefore", "performedBy", "reversible", "revertedAt") SELECT "actionType", "createdAt", "entityId", "entityType", "id", "organizationId", "payloadAfter", "payloadBefore", "performedBy", "reversible", "revertedAt" FROM "AuditLogEntry";
DROP TABLE "AuditLogEntry";
ALTER TABLE "new_AuditLogEntry" RENAME TO "AuditLogEntry";
CREATE INDEX "AuditLogEntry_entityType_entityId_idx" ON "AuditLogEntry"("entityType", "entityId");
CREATE INDEX "AuditLogEntry_createdAt_idx" ON "AuditLogEntry"("createdAt");
CREATE INDEX "AuditLogEntry_organizationId_idx" ON "AuditLogEntry"("organizationId");
CREATE TABLE "new_Email" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "mailAccountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "rawBody" TEXT NOT NULL,
    "summary" TEXT,
    "receivedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "priorityScore" REAL NOT NULL DEFAULT 0,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "isMarketing" BOOLEAN NOT NULL DEFAULT false,
    "marketingReason" TEXT,
    "category" TEXT,
    "classifiedAt" DATETIME,
    "readAt" DATETIME,
    "respondedAt" DATETIME,
    "gmailMessageId" TEXT,
    "rfcMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Email_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Email_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Email_mailAccountId_fkey" FOREIGN KEY ("mailAccountId") REFERENCES "MailAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Email" ("category", "classifiedAt", "createdAt", "gmailMessageId", "id", "isMarketing", "isUrgent", "mailAccountId", "marketingReason", "organizationId", "priorityScore", "rawBody", "readAt", "receivedAt", "respondedAt", "rfcMessageId", "senderId", "status", "subject", "summary", "threadId") SELECT "category", "classifiedAt", "createdAt", "gmailMessageId", "id", "isMarketing", "isUrgent", "mailAccountId", "marketingReason", "organizationId", "priorityScore", "rawBody", "readAt", "receivedAt", "respondedAt", "rfcMessageId", "senderId", "status", "subject", "summary", "threadId" FROM "Email";
DROP TABLE "Email";
ALTER TABLE "new_Email" RENAME TO "Email";
CREATE UNIQUE INDEX "Email_gmailMessageId_key" ON "Email"("gmailMessageId");
CREATE INDEX "Email_status_idx" ON "Email"("status");
CREATE INDEX "Email_threadId_idx" ON "Email"("threadId");
CREATE INDEX "Email_mailAccountId_idx" ON "Email"("mailAccountId");
CREATE INDEX "Email_organizationId_idx" ON "Email"("organizationId");
CREATE TABLE "new_ExtraConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "calendarEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoDraftToneEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vipSlaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "analyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExtraConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExtraConfig" ("analyticsEnabled", "autoDraftToneEnabled", "calendarEnabled", "id", "organizationId", "updatedAt", "vipSlaEnabled", "whatsappEnabled") SELECT "analyticsEnabled", "autoDraftToneEnabled", "calendarEnabled", "id", "organizationId", "updatedAt", "vipSlaEnabled", "whatsappEnabled" FROM "ExtraConfig";
DROP TABLE "ExtraConfig";
ALTER TABLE "new_ExtraConfig" RENAME TO "ExtraConfig";
CREATE UNIQUE INDEX "ExtraConfig_organizationId_key" ON "ExtraConfig"("organizationId");
CREATE TABLE "new_MailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "googleRefreshToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MailAccount" ("createdAt", "emailAddress", "googleRefreshToken", "id", "isActive", "label", "organizationId", "provider") SELECT "createdAt", "emailAddress", "googleRefreshToken", "id", "isActive", "label", "organizationId", "provider" FROM "MailAccount";
DROP TABLE "MailAccount";
ALTER TABLE "new_MailAccount" RENAME TO "MailAccount";
CREATE UNIQUE INDEX "MailAccount_emailAddress_key" ON "MailAccount"("emailAddress");
CREATE INDEX "MailAccount_organizationId_idx" ON "MailAccount"("organizationId");
CREATE TABLE "new_ScanCycleLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailsImported" INTEGER NOT NULL DEFAULT 0,
    "emailsScanned" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "serviceLevel" INTEGER NOT NULL,
    "backlogCount" INTEGER NOT NULL,
    CONSTRAINT "ScanCycleLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ScanCycleLog" ("backlogCount", "emailsImported", "emailsScanned", "id", "inputTokens", "organizationId", "outputTokens", "serviceLevel", "startedAt", "totalTokens") SELECT "backlogCount", "emailsImported", "emailsScanned", "id", "inputTokens", "organizationId", "outputTokens", "serviceLevel", "startedAt", "totalTokens" FROM "ScanCycleLog";
DROP TABLE "ScanCycleLog";
ALTER TABLE "new_ScanCycleLog" RENAME TO "ScanCycleLog";
CREATE INDEX "ScanCycleLog_startedAt_idx" ON "ScanCycleLog"("startedAt");
CREATE INDEX "ScanCycleLog_organizationId_idx" ON "ScanCycleLog"("organizationId");
CREATE TABLE "new_Sender" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "vipReason" TEXT,
    "organization" TEXT,
    "autoCategory" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sender_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Sender" ("autoCategory", "createdAt", "email", "id", "isVip", "name", "organization", "organizationId", "vipReason") SELECT "autoCategory", "createdAt", "email", "id", "isVip", "name", "organization", "organizationId", "vipReason" FROM "Sender";
DROP TABLE "Sender";
ALTER TABLE "new_Sender" RENAME TO "Sender";
CREATE UNIQUE INDEX "Sender_organizationId_email_key" ON "Sender"("organizationId", "email");
CREATE TABLE "new_UrgentAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "commitmentId" TEXT,
    "message" TEXT NOT NULL,
    "dueAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    CONSTRAINT "UrgentAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UrgentAlert_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UrgentAlert_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_UrgentAlert" ("commitmentId", "createdAt", "dueAt", "emailId", "id", "message", "organizationId", "readAt") SELECT "commitmentId", "createdAt", "dueAt", "emailId", "id", "message", "organizationId", "readAt" FROM "UrgentAlert";
DROP TABLE "UrgentAlert";
ALTER TABLE "new_UrgentAlert" RENAME TO "UrgentAlert";
CREATE INDEX "UrgentAlert_readAt_idx" ON "UrgentAlert"("readAt");
CREATE INDEX "UrgentAlert_emailId_idx" ON "UrgentAlert"("emailId");
CREATE INDEX "UrgentAlert_organizationId_idx" ON "UrgentAlert"("organizationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

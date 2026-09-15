/*
  Warnings:

  - You are about to drop the `ServiceLevelHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ServiceLevelHistory";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "digestRecipientEmail" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AppSettings" ("digestRecipientEmail", "id", "timeZone", "updatedAt") SELECT "digestRecipientEmail", "id", "timeZone", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
CREATE UNIQUE INDEX "AppSettings_organizationId_key" ON "AppSettings"("organizationId");
CREATE TABLE "new_AuditLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "actionType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payloadBefore" TEXT,
    "payloadAfter" TEXT,
    "performedBy" TEXT NOT NULL DEFAULT 'SYSTEM',
    "reversible" BOOLEAN NOT NULL DEFAULT true,
    "revertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLogEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLogEntry" ("actionType", "createdAt", "entityId", "entityType", "id", "payloadAfter", "payloadBefore", "performedBy", "reversible", "revertedAt") SELECT "actionType", "createdAt", "entityId", "entityType", "id", "payloadAfter", "payloadBefore", "performedBy", "reversible", "revertedAt" FROM "AuditLogEntry";
DROP TABLE "AuditLogEntry";
ALTER TABLE "new_AuditLogEntry" RENAME TO "AuditLogEntry";
CREATE INDEX "AuditLogEntry_entityType_entityId_idx" ON "AuditLogEntry"("entityType", "entityId");
CREATE INDEX "AuditLogEntry_createdAt_idx" ON "AuditLogEntry"("createdAt");
CREATE INDEX "AuditLogEntry_organizationId_idx" ON "AuditLogEntry"("organizationId");
CREATE TABLE "new_Email" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
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
    CONSTRAINT "Email_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Email_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Email_mailAccountId_fkey" FOREIGN KEY ("mailAccountId") REFERENCES "MailAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Email" ("category", "classifiedAt", "createdAt", "gmailMessageId", "id", "isMarketing", "isUrgent", "mailAccountId", "marketingReason", "priorityScore", "rawBody", "readAt", "receivedAt", "respondedAt", "rfcMessageId", "senderId", "status", "subject", "summary", "threadId") SELECT "category", "classifiedAt", "createdAt", "gmailMessageId", "id", "isMarketing", "isUrgent", "mailAccountId", "marketingReason", "priorityScore", "rawBody", "readAt", "receivedAt", "respondedAt", "rfcMessageId", "senderId", "status", "subject", "summary", "threadId" FROM "Email";
DROP TABLE "Email";
ALTER TABLE "new_Email" RENAME TO "Email";
CREATE UNIQUE INDEX "Email_gmailMessageId_key" ON "Email"("gmailMessageId");
CREATE INDEX "Email_status_idx" ON "Email"("status");
CREATE INDEX "Email_threadId_idx" ON "Email"("threadId");
CREATE INDEX "Email_mailAccountId_idx" ON "Email"("mailAccountId");
CREATE INDEX "Email_organizationId_idx" ON "Email"("organizationId");
CREATE TABLE "new_ExtraConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "calendarEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoDraftToneEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vipSlaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "analyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExtraConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExtraConfig" ("analyticsEnabled", "autoDraftToneEnabled", "calendarEnabled", "id", "updatedAt", "vipSlaEnabled", "whatsappEnabled") SELECT "analyticsEnabled", "autoDraftToneEnabled", "calendarEnabled", "id", "updatedAt", "vipSlaEnabled", "whatsappEnabled" FROM "ExtraConfig";
DROP TABLE "ExtraConfig";
ALTER TABLE "new_ExtraConfig" RENAME TO "ExtraConfig";
CREATE UNIQUE INDEX "ExtraConfig_organizationId_key" ON "ExtraConfig"("organizationId");
CREATE TABLE "new_MailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "emailAddress" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "googleRefreshToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MailAccount" ("createdAt", "emailAddress", "googleRefreshToken", "id", "isActive", "label", "provider") SELECT "createdAt", "emailAddress", "googleRefreshToken", "id", "isActive", "label", "provider" FROM "MailAccount";
DROP TABLE "MailAccount";
ALTER TABLE "new_MailAccount" RENAME TO "MailAccount";
CREATE UNIQUE INDEX "MailAccount_emailAddress_key" ON "MailAccount"("emailAddress");
CREATE INDEX "MailAccount_organizationId_idx" ON "MailAccount"("organizationId");
CREATE TABLE "new_ScanCycleLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailsImported" INTEGER NOT NULL DEFAULT 0,
    "emailsScanned" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "serviceLevel" INTEGER NOT NULL,
    "backlogCount" INTEGER NOT NULL,
    CONSTRAINT "ScanCycleLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ScanCycleLog" ("backlogCount", "emailsImported", "emailsScanned", "id", "inputTokens", "outputTokens", "serviceLevel", "startedAt", "totalTokens") SELECT "backlogCount", "emailsImported", "emailsScanned", "id", "inputTokens", "outputTokens", "serviceLevel", "startedAt", "totalTokens" FROM "ScanCycleLog";
DROP TABLE "ScanCycleLog";
ALTER TABLE "new_ScanCycleLog" RENAME TO "ScanCycleLog";
CREATE INDEX "ScanCycleLog_startedAt_idx" ON "ScanCycleLog"("startedAt");
CREATE INDEX "ScanCycleLog_organizationId_idx" ON "ScanCycleLog"("organizationId");
CREATE TABLE "new_Sender" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "vipReason" TEXT,
    "organization" TEXT,
    "autoCategory" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sender_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sender" ("autoCategory", "createdAt", "email", "id", "isVip", "name", "organization", "vipReason") SELECT "autoCategory", "createdAt", "email", "id", "isVip", "name", "organization", "vipReason" FROM "Sender";
DROP TABLE "Sender";
ALTER TABLE "new_Sender" RENAME TO "Sender";
CREATE UNIQUE INDEX "Sender_email_key" ON "Sender"("email");
CREATE INDEX "Sender_organizationId_idx" ON "Sender"("organizationId");
CREATE TABLE "new_UrgentAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "emailId" TEXT NOT NULL,
    "commitmentId" TEXT,
    "message" TEXT NOT NULL,
    "dueAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    CONSTRAINT "UrgentAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UrgentAlert_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UrgentAlert_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_UrgentAlert" ("commitmentId", "createdAt", "dueAt", "emailId", "id", "message", "readAt") SELECT "commitmentId", "createdAt", "dueAt", "emailId", "id", "message", "readAt" FROM "UrgentAlert";
DROP TABLE "UrgentAlert";
ALTER TABLE "new_UrgentAlert" RENAME TO "UrgentAlert";
CREATE INDEX "UrgentAlert_readAt_idx" ON "UrgentAlert"("readAt");
CREATE INDEX "UrgentAlert_emailId_idx" ON "UrgentAlert"("emailId");
CREATE INDEX "UrgentAlert_organizationId_idx" ON "UrgentAlert"("organizationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

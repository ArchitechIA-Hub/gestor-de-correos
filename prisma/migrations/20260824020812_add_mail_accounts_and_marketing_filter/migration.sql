/*
  Warnings:

  - Added the required column `mailAccountId` to the `Email` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailAddress" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Cuenta de respaldo para asociar los correos existentes antes de esta
-- migración (mailAccountId pasa a ser requerido). Los correos generados a
-- partir de ahora usan las cuentas reales de MOCK_ACCOUNTS / las que se
-- creen desde /settings/accounts.
INSERT INTO "MailAccount" ("id", "emailAddress", "label") VALUES ('legacy-default-account', 'sin-asignar@migracion.local', 'Sin asignar (pre-migración)');

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Email" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "mailAccountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "rawBody" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "priorityScore" REAL NOT NULL DEFAULT 0,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "isMarketing" BOOLEAN NOT NULL DEFAULT false,
    "marketingReason" TEXT,
    "classifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Email_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Email_mailAccountId_fkey" FOREIGN KEY ("mailAccountId") REFERENCES "MailAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Email" ("classifiedAt", "createdAt", "id", "isUrgent", "mailAccountId", "priorityScore", "rawBody", "receivedAt", "senderId", "status", "subject", "threadId") SELECT "classifiedAt", "createdAt", "id", "isUrgent", 'legacy-default-account', "priorityScore", "rawBody", "receivedAt", "senderId", "status", "subject", "threadId" FROM "Email";
DROP TABLE "Email";
ALTER TABLE "new_Email" RENAME TO "Email";
CREATE INDEX "Email_status_idx" ON "Email"("status");
CREATE INDEX "Email_threadId_idx" ON "Email"("threadId");
CREATE INDEX "Email_mailAccountId_idx" ON "Email"("mailAccountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_emailAddress_key" ON "MailAccount"("emailAddress");

-- CreateTable
CREATE TABLE "ScanCycleLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailsImported" INTEGER NOT NULL DEFAULT 0,
    "emailsScanned" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "serviceLevel" INTEGER NOT NULL,
    "backlogCount" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "ScanCycleLog_startedAt_idx" ON "ScanCycleLog"("startedAt");

-- CreateTable
CREATE TABLE "UrgentAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailId" TEXT NOT NULL,
    "commitmentId" TEXT,
    "message" TEXT NOT NULL,
    "dueAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    CONSTRAINT "UrgentAlert_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UrgentAlert_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UrgentAlert_readAt_idx" ON "UrgentAlert"("readAt");

-- CreateIndex
CREATE INDEX "UrgentAlert_emailId_idx" ON "UrgentAlert"("emailId");

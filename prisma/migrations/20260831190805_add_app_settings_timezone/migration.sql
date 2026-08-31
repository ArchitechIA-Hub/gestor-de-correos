-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "digestRecipientEmail" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("digestRecipientEmail", "id", "updatedAt") SELECT "digestRecipientEmail", "id", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const TEST_DB_PATH = path.resolve(process.cwd(), "prisma/test.db");

/**
 * Prepara una base de datos SQLite separada para la suite de tests (nunca la
 * de desarrollo), aplicando todas las migraciones existentes en orden. Se
 * recrea desde cero en cada corrida de la suite completa.
 */
export default function setup() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const filePath = `${TEST_DB_PATH}${suffix}`;
    if (existsSync(filePath)) unlinkSync(filePath);
  }

  const db = new Database(TEST_DB_PATH);
  const migrationsDir = path.resolve(process.cwd(), "prisma/migrations");
  const folders = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const folder of folders) {
    const sqlPath = path.join(migrationsDir, folder, "migration.sql");
    if (!existsSync(sqlPath)) continue;
    db.exec(readFileSync(sqlPath, "utf-8"));
  }

  db.close();
}

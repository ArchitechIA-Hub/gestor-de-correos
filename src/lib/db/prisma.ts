import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: InstanceType<typeof PrismaClient> | undefined;
}

// El prototipo corre en SQLite localmente; los despliegues remotos (ej. el
// VPS de demo) usan Postgres. El adapter se elige según el esquema de
// DATABASE_URL para no duplicar código entre ambos entornos.
function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = url.startsWith("file:") ? new PrismaBetterSqlite3({ url }) : new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

// En dev, Next.js recarga módulos en caliente; reutilizamos la instancia
// global para no agotar conexiones a SQLite entre recargas.
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

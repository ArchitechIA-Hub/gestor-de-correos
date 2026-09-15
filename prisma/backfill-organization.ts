import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db/prisma";
import { Prisma } from "../src/generated/prisma/client";

/**
 * Backfill de datos existentes tras la migración `add_multitenancy_organization_user`
 * (ver decision_multitenant_organization_user en memoria): crea la primera
 * Organization + su primer User, y asigna `organizationId` a toda fila
 * existente que todavía lo tenga en null.
 *
 * Idempotente: si ya existe alguna Organization, no hace nada (evita crear
 * una segunda organización "Legacy" por accidente si se corre dos veces).
 *
 * Uso: npx tsx prisma/backfill-organization.ts [--org-name "Nombre"] [--user-email correo@dominio.com] [--user-name "Nombre Persona"]
 *
 * IMPORTANTE (orden de despliegue): correr esto contra una base de datos
 * (dev.db local o el Postgres de la demo) ANTES de desplegar el código que ya
 * filtra por organizationId. El código viejo ignora la columna nueva sin
 * problema; el código nuevo, si corre contra filas con organizationId NULL,
 * las excluye de todo — parecería que "se perdió la bandeja".
 */

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

async function main() {
  const existingOrg = await prisma.organization.findFirst();
  if (existingOrg) {
    console.log(
      `Ya existe al menos una Organization ("${existingOrg.name}", id ${existingOrg.id}) — backfill no necesario, no se hace nada. Si de verdad hay filas con organizationId NULL (por ejemplo tras una migración parcial), corrígelas a mano.`
    );
    return;
  }

  const orgName = parseArg("--org-name") ?? "Daniel Martínez";
  const userEmail = parseArg("--user-email") ?? "dmmp010@gmail.com";
  const userName = parseArg("--user-name") ?? "Daniel Martínez";
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const { organization, user } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: orgName } });
    const user = await tx.user.create({
      data: { organizationId: organization.id, email: userEmail, name: userName, passwordHash },
    });

    // AppSettings/ExtraConfig eran fila única global (patrón singleton
    // findFirst()+create) — si ya existe una fila (creada por ese patrón),
    // se le asigna la organización; si no existe ninguna, se crea aquí para
    // que el resto del código (ahora por-organización) tenga de dónde partir.
    const existingSettings = await tx.appSettings.findFirst();
    if (existingSettings) {
      await tx.appSettings.update({ where: { id: existingSettings.id }, data: { organizationId: organization.id } });
    } else {
      await tx.appSettings.create({ data: { organizationId: organization.id } });
    }

    const existingExtras = await tx.extraConfig.findFirst();
    if (existingExtras) {
      await tx.extraConfig.update({ where: { id: existingExtras.id }, data: { organizationId: organization.id } });
    } else {
      await tx.extraConfig.create({ data: { organizationId: organization.id } });
    }

    // Raw en vez de updateMany tipado: el Prisma Client se genera desde el
    // schema FINAL (organizationId ya NOT NULL), así que TypeScript rechaza
    // `where: { organizationId: null }` aunque este script está pensado para
    // correr justo en la ventana en la que la columna SÍ es nullable en la
    // base de datos real (entre la migración 1 y la migración 2 — ver
    // comentario de cabecera).
    for (const table of ["MailAccount", "Sender", "Email", "AuditLogEntry", "ScanCycleLog", "UrgentAlert"]) {
      await tx.$executeRaw`UPDATE ${Prisma.raw(`"${table}"`)} SET "organizationId" = ${organization.id} WHERE "organizationId" IS NULL`;
    }

    return { organization, user };
  });

  console.log("Backfill completo.");
  console.log(`  Organization: "${organization.name}" (id ${organization.id})`);
  console.log(`  User inicial: ${user.email} (id ${user.id})`);
  console.log(`  Password temporal (guárdala ahora, no se vuelve a mostrar): ${tempPassword}`);
}

main()
  .catch((error) => {
    console.error("Error en el backfill:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

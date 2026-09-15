import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db/prisma";

/**
 * Alta de un cliente nuevo (Organization + su primer User). Deliberadamente
 * un script CLI, no una Server Action expuesta en la app: con pocos clientes
 * onboarded a mano, un script que solo corre con acceso directo a
 * DATABASE_URL es más seguro que un endpoint protegido por secreto dentro
 * del mismo proceso desplegado (ver decision_multitenant_organization_user
 * en memoria). No hay registro público.
 *
 * Uso: npx tsx prisma/provision-org.ts --org-name "Cliente X" --user-email "persona@cliente.com" --user-name "Persona"
 */

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

async function main() {
  const orgName = parseArg("--org-name");
  const userEmail = parseArg("--user-email")?.trim().toLowerCase();
  const userName = parseArg("--user-name");

  if (!orgName || !userEmail || !userName) {
    console.error(
      'Uso: npx tsx prisma/provision-org.ts --org-name "Cliente X" --user-email "persona@cliente.com" --user-name "Persona"'
    );
    process.exitCode = 1;
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: userEmail } });
  if (existingUser) {
    console.error(`Ya existe un usuario con el email ${userEmail} (organización ${existingUser.organizationId}).`);
    process.exitCode = 1;
    return;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const { organization, user } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: orgName } });
    const user = await tx.user.create({
      data: { organizationId: organization.id, email: userEmail, name: userName, passwordHash },
    });
    // Cada organización necesita su propia fila de AppSettings/ExtraConfig
    // desde el día uno (ya no son singleton global — ver Patrón A del plan).
    await tx.appSettings.create({ data: { organizationId: organization.id } });
    await tx.extraConfig.create({ data: { organizationId: organization.id } });
    return { organization, user };
  });

  console.log("Organización creada.");
  console.log(`  Organization: "${organization.name}" (id ${organization.id})`);
  console.log(`  User inicial: ${user.email} (id ${user.id})`);
  console.log(`  Password temporal (guárdala ahora, no se vuelve a mostrar): ${tempPassword}`);
  console.log("  Pásasela al cliente por un canal distinto al del link de acceso.");
}

main()
  .catch((error) => {
    console.error("Error creando la organización:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db/prisma";

/**
 * Añade una persona más a una organización YA existente (ej. el asistente
 * del ejecutivo que ya tiene cuenta) — comparten los mismos datos, cada quien
 * con su propio login. Ver prisma/provision-org.ts para dar de alta un
 * cliente nuevo.
 *
 * Uso: npx tsx prisma/add-user.ts --org-id "cmu1..." --user-email "asistente@cliente.com" --user-name "Persona"
 */

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

async function main() {
  const orgId = parseArg("--org-id");
  const userEmail = parseArg("--user-email")?.trim().toLowerCase();
  const userName = parseArg("--user-name");

  if (!orgId || !userEmail || !userName) {
    console.error(
      'Uso: npx tsx prisma/add-user.ts --org-id "cmu1..." --user-email "asistente@cliente.com" --user-name "Persona"'
    );
    process.exitCode = 1;
    return;
  }

  const organization = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!organization) {
    console.error(`No existe ninguna organización con id ${orgId}.`);
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
  const user = await prisma.user.create({ data: { organizationId: orgId, email: userEmail, name: userName, passwordHash } });

  console.log(`Usuario añadido a "${organization.name}".`);
  console.log(`  User: ${user.email} (id ${user.id})`);
  console.log(`  Password temporal (guárdala ahora, no se vuelve a mostrar): ${tempPassword}`);
}

main()
  .catch((error) => {
    console.error("Error añadiendo el usuario:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

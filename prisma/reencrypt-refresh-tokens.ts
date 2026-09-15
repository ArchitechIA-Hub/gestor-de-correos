import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { encrypt, decrypt } from "../src/lib/crypto/encryption";

/**
 * Migración PENDIENTE DE EJECUCIÓN MANUAL COORDINADA — no la corre este
 * script solo, ni se corre automáticamente en ningún deploy.
 *
 * Contexto: `MailAccount.googleRefreshToken` se guardaba en texto plano.
 * `src/lib/crypto/encryption.ts` cifra (AES-256-GCM) toda escritura NUEVA
 * (conectar/reconectar una cuenta de Gmail) y descifra de forma transparente
 * al leer — pero un refresh token que ya estaba en texto plano en la base
 * ANTES de este cambio se queda tal cual hasta que:
 *   (a) el usuario reconecta esa cuenta desde /settings/accounts (la
 *       reconexión ya lo re-guarda cifrado, sin tocar este script), o
 *   (b) alguien corre esta migración a mano.
 *
 * Este script hace (b): cifra en el lugar cualquier googleRefreshToken que
 * todavía esté en texto plano. Es idempotente — un valor ya cifrado
 * (formato "v1:...") se detecta y se deja intacto, así que correrlo dos
 * veces (o sobre una base mixta, algunas cuentas ya reconectadas y otras no)
 * es seguro.
 *
 * ORDEN DE DESPLIEGUE (igual de cuidadoso que el rollout de multi-tenant —
 * ver decision_multitenant_organization_user en memoria):
 *   1. Generar ENCRYPTION_KEY (openssl rand -base64 32) y agregarla a las
 *      variables de entorno del VPS (mismo mecanismo que SESSION_SECRET).
 *   2. Desplegar el código de este commit (ya tolera texto plano legado en
 *      lectura, así que las cuentas ya conectadas NO se rompen en este paso).
 *   3. Correr este script UNA VEZ contra la base de producción:
 *        npx tsx prisma/reencrypt-refresh-tokens.ts
 *      (requiere DATABASE_URL Y ENCRYPTION_KEY del entorno real — correrlo
 *      desde el VPS, no en local contra dev.db).
 *   4. Verificar con --dry-run primero si hay dudas (no escribe nada, solo
 *      reporta cuántas filas migraría).
 *
 * Uso:
 *   npx tsx prisma/reencrypt-refresh-tokens.ts [--dry-run]
 */

function parseArg(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const dryRun = parseArg("--dry-run");

  const accounts = await prisma.mailAccount.findMany({
    where: { googleRefreshToken: { not: null } },
    select: { id: true, emailAddress: true, googleRefreshToken: true },
  });

  let alreadyEncrypted = 0;
  let migrated = 0;

  for (const account of accounts) {
    const stored = account.googleRefreshToken!;

    // decrypt() devuelve el valor tal cual si NO tiene el formato cifrado —
    // así que si decrypt(stored) === stored, o bien ya estaba cifrado (en
    // cuyo caso re-cifrarlo produciría un valor distinto pero equivalente,
    // que no necesitamos) o realmente es texto plano. Distinguimos mirando
    // el formato directamente en vez de basarnos en la igualdad.
    const looksEncrypted = stored.startsWith("v1:") && stored.split(":").length === 4;
    if (looksEncrypted) {
      alreadyEncrypted++;
      continue;
    }

    migrated++;
    console.log(`${dryRun ? "[dry-run] migraría" : "migrando"}: ${account.emailAddress} (id ${account.id})`);
    if (!dryRun) {
      const reencrypted = encrypt(stored);
      // Verificación de ida y vuelta antes de escribir: nunca dejar la fila
      // peor de lo que estaba.
      if (decrypt(reencrypted) !== stored) {
        throw new Error(`Verificación de round-trip falló para la cuenta ${account.id} — abortando sin escribir.`);
      }
      await prisma.mailAccount.update({
        where: { id: account.id },
        data: { googleRefreshToken: reencrypted },
      });
    }
  }

  console.log("");
  console.log(dryRun ? "Dry-run completo (no se escribió nada)." : "Migración completa.");
  console.log(`  Ya estaban cifradas: ${alreadyEncrypted}`);
  console.log(`  ${dryRun ? "A migrar" : "Migradas"}: ${migrated}`);
}

main()
  .catch((error) => {
    console.error("Error en la migración de re-cifrado:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

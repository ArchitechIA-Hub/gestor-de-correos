import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * Cifrado simétrico en reposo (AES-256-GCM) para secretos que hoy viven en
 * texto plano en la base de datos — hoy solo `MailAccount.googleRefreshToken`
 * (ver `src/lib/gmail/client.ts`). Nunca usar Web Crypto / Edge aquí: los
 * únicos consumidores (Route Handlers, Server Actions, scripts de `prisma/`)
 * corren en runtime Node, así que el módulo nativo `node:crypto` es correcto
 * (a diferencia de `src/lib/auth/session.ts`, que sí necesita `jose` por
 * correr también en el Edge de `src/proxy.ts`).
 *
 * Formato de salida: `v1:<iv base64>:<authTag base64>:<ciphertext base64>`.
 * El prefijo de versión permite reconocer un valor ya cifrado y, sobre todo,
 * distinguirlo de un valor legado en texto plano (ver `decrypt` más abajo) —
 * eso es lo que hace posible desplegar el cifrado sin tener que re-encriptar
 * en el mismo instante todo lo que ya hay guardado en producción.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // recomendado para GCM
const KEY_LENGTH_BYTES = 32; // AES-256
const VERSION_PREFIX = "v1";

let cachedKey: Buffer | null = null;

/**
 * Lee y valida `ENCRYPTION_KEY` (una sola vez por proceso). Se espera en
 * base64 y debe decodificar a exactamente 32 bytes — generar con:
 *   openssl rand -base64 32
 * Falla rápido y con un mensaje claro en vez de cifrar con una clave
 * derivada débilmente o de largo incorrecto.
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Falta la variable de entorno ENCRYPTION_KEY (requerida para cifrar/descifrar credenciales guardadas, ej. el refresh token de Gmail). Genera una con: openssl rand -base64 32"
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("ENCRYPTION_KEY no es base64 válido.");
  }

  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY debe decodificar a ${KEY_LENGTH_BYTES} bytes (AES-256) — tiene ${key.length}. Genera una con: openssl rand -base64 32`
    );
  }

  cachedKey = key;
  return key;
}

/** Cifra un string en texto plano. Nunca devuelve el valor sin cifrar. */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION_PREFIX, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":"
  );
}

/** ¿Este valor tiene la forma de algo que `encrypt()` produjo? */
function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION_PREFIX}:`) && value.split(":").length === 4;
}

/**
 * Descifra un valor producido por `encrypt()`. Si el valor NO tiene el
 * formato cifrado, se asume texto plano legado (dato guardado antes de
 * activar `ENCRYPTION_KEY` en este entorno) y se devuelve tal cual — permite
 * desplegar el cifrado sin romper cuentas ya conectadas mientras se coordina
 * la migración real (`prisma/reencrypt-refresh-tokens.ts`, pendiente de
 * ejecución manual). Una vez migrado todo, este camino deja de ejercitarse.
 */
export function decrypt(value: string): string {
  if (!isEncrypted(value)) return value;

  const [, ivB64, authTagB64, ciphertextB64] = value.split(":");
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Solo para tests/scripts que necesiten forzar una nueva lectura de la clave. */
export function __resetEncryptionKeyCacheForTests(): void {
  cachedKey = null;
}

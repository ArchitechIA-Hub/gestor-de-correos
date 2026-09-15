import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt, __resetEncryptionKeyCacheForTests } from "./encryption";

beforeEach(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  __resetEncryptionKeyCacheForTests();
});

describe("encryption (AES-256-GCM en reposo)", () => {
  it("round-trip: lo que se cifra es lo que se descifra", () => {
    const plaintext = "1//0g-refresh-token-de-verdad";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("dos cifrados del mismo texto no son iguales (IV aleatorio por llamada)", () => {
    const plaintext = "mismo-secreto";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it("un valor en texto plano legado (sin el formato v1:...) se devuelve tal cual al 'descifrar'", () => {
    // Simula un refresh token guardado ANTES de activar ENCRYPTION_KEY en este
    // entorno — la migración real vive en prisma/reencrypt-refresh-tokens.ts,
    // pendiente de ejecución manual coordinada.
    const legacyPlaintext = "1//0legacy-refresh-token";
    expect(decrypt(legacyPlaintext)).toBe(legacyPlaintext);
  });

  it("rechaza un ciphertext manipulado (falla la verificación del authTag de GCM)", () => {
    const ciphertext = encrypt("dato-sensible");
    const [version, iv, authTag, data] = ciphertext.split(":");
    // Voltea un bit de los datos cifrados sin recalcular el authTag.
    const bytes = Buffer.from(data, "base64");
    bytes[0] = bytes[0] ^ 0xff;
    const tampered = [version, iv, authTag, bytes.toString("base64")].join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("lanza un error claro si falta ENCRYPTION_KEY", () => {
    delete process.env.ENCRYPTION_KEY;
    __resetEncryptionKeyCacheForTests();
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
  });

  it("lanza un error claro si ENCRYPTION_KEY no tiene 32 bytes", () => {
    process.env.ENCRYPTION_KEY = Buffer.from("demasiado-corta").toString("base64");
    __resetEncryptionKeyCacheForTests();
    expect(() => encrypt("x")).toThrow(/32 bytes/);
  });
});

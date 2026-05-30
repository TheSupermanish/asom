import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import prompts from "prompts";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";

/**
 * Encrypted, non-custodial key store for the tsugu CLI.
 *
 * Your private key is encrypted with a password you choose (scrypt → AES-256-GCM)
 * and written to ~/.tsugu/keystore.json. The plaintext key never touches disk and
 * is never sent anywhere — this runs entirely on your machine. Wrong password =
 * the GCM auth check fails and decryption throws. Same pattern as `cast wallet`.
 */

export const TSUGU_HOME = process.env.TSUGU_HOME || join(homedir(), ".tsugu");
const KEYSTORE_PATH = join(TSUGU_HOME, "keystore.json");

type Hex = `0x${string}`;

interface KeystoreFile {
  version: 1;
  kdf: "scrypt";
  n: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
  address: Address;
}

const SCRYPT_N = 1 << 15; // 32768
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2; // headroom for scrypt

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAXMEM });
}

export function hasKeystore(): boolean {
  return existsSync(KEYSTORE_PATH);
}

export function keystoreAddress(): Address | null {
  if (!hasKeystore()) return null;
  try {
    return (JSON.parse(readFileSync(KEYSTORE_PATH, "utf8")) as KeystoreFile).address;
  } catch {
    return null;
  }
}

export function saveKeystore(privateKey: Hex, password: string): Address {
  const address = privateKeyToAccount(privateKey).address;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const file: KeystoreFile = {
    version: 1,
    kdf: "scrypt",
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    address,
  };

  if (!existsSync(TSUGU_HOME)) mkdirSync(TSUGU_HOME, { recursive: true, mode: 0o700 });
  writeFileSync(KEYSTORE_PATH, JSON.stringify(file, null, 2) + "\n", { mode: 0o600 });
  return address;
}

/** Decrypt the keystore. Throws "wrong password" if the password is incorrect. */
export function loadKeystore(password: string): Hex {
  const file = JSON.parse(readFileSync(KEYSTORE_PATH, "utf8")) as KeystoreFile;
  const key = deriveKey(password, Buffer.from(file.salt, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "hex"));
  decipher.setAuthTag(Buffer.from(file.tag, "hex"));
  try {
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(file.ciphertext, "hex")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8") as Hex;
  } catch {
    throw new Error("wrong password");
  }
}

export function removeKeystore(): void {
  if (hasKeystore()) rmSync(KEYSTORE_PATH);
}

/** Prompt for input; `hidden` masks it (passwords). Uses the `prompts` library
 *  for correct TTY masking and Ctrl-C handling. Exits cleanly if cancelled. */
export async function prompt(question: string, hidden = false): Promise<string> {
  const { value } = await prompts(
    { type: hidden ? "password" : "text", name: "value", message: question.trim() },
    { onCancel: () => process.exit(1) },
  );
  return String(value ?? "").trim();
}

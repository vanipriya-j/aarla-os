/**
 * Credential hashing for internal accounts (PIN / password).
 * scrypt + random salt — never store plaintext.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

export function hashCredential(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyCredential(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  const actual = scryptSync(plain, salt, KEYLEN);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Soft validation — letters, numbers, . _ - */
export function isValidUsername(raw: string): boolean {
  const u = normalizeUsername(raw);
  return /^[a-z0-9][a-z0-9._-]{1,31}$/.test(u);
}

/** Reserved for env founder/CRM shared logins — not team accounts. */
const RESERVED_USERNAMES = new Set(["admin", "crm", "local", "root", "system"]);

export function isReservedUsername(raw: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(raw));
}

export function isValidPinOrPassword(raw: string): boolean {
  return raw.length >= 4 && raw.length <= 128;
}

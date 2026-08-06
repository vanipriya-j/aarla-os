import { createHash, randomBytes } from "node:crypto";

const DEFAULT_TTL_DAYS = 14;

export function sessionTtlDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AUTH_SESSION_TTL_DAYS?.trim();
  if (!raw) return DEFAULT_TTL_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 90) return DEFAULT_TTL_DAYS;
  return n;
}

export function sessionTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  return sessionTtlDays(env) * 24 * 60 * 60;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

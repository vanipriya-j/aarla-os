import "server-only";

import type { QueryResultRow } from "pg";
import { getPool } from "@/lib/infra/db/pool";
import type { AppRole } from "@/lib/auth/roles";
import type { AuthSession } from "@/lib/auth/session-types";
import {
  generateSessionToken,
  hashSessionToken,
  sessionTtlDays,
  sessionTtlSeconds,
} from "@/lib/auth/sessions-crypto";

export type { AuthSession } from "@/lib/auth/session-types";
export {
  generateSessionToken,
  hashSessionToken,
  sessionTtlDays,
  sessionTtlSeconds,
} from "@/lib/auth/sessions-crypto";

/**
 * Direct pool query for auth (works in Node proxy + route handlers).
 * Avoids next/server `connection()` which is App Router request-scoped.
 */
async function authQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export type AuthSessionRow = {
  id: string;
  username: string;
  role: AppRole;
  user_agent: string | null;
  ip: string | null;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
};

function toSession(row: AuthSessionRow): AuthSession {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    userAgent: row.user_agent,
    ip: row.ip,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

export async function createAuthSession(input: {
  username: string;
  role: AppRole;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<{ token: string; session: AuthSession }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const ttlDays = sessionTtlDays();
  const rows = await authQuery<AuthSessionRow>(
    `
    insert into auth_sessions (
      token_hash, username, role, user_agent, ip, expires_at
    ) values (
      $1, $2, $3, $4, $5, now() + ($6::text || ' days')::interval
    )
    returning id, username, role, user_agent, ip, created_at, last_seen_at, expires_at
    `,
    [
      tokenHash,
      input.username,
      input.role,
      input.userAgent?.slice(0, 500) ?? null,
      input.ip?.slice(0, 80) ?? null,
      String(ttlDays),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Failed to create auth session");
  return { token, session: toSession(row) };
}

/** Resolve an active session from the raw cookie token; touches last_seen_at. */
export async function resolveAuthSession(
  token: string | null | undefined,
): Promise<AuthSession | null> {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const rows = await authQuery<AuthSessionRow>(
    `
    update auth_sessions
    set last_seen_at = now()
    where token_hash = $1
      and revoked_at is null
      and expires_at > now()
    returning id, username, role, user_agent, ip, created_at, last_seen_at, expires_at
    `,
    [tokenHash],
  );
  const row = rows[0];
  return row ? toSession(row) : null;
}

export async function revokeAuthSession(sessionId: string): Promise<boolean> {
  const rows = await authQuery<{ id: string }>(
    `
    update auth_sessions
    set revoked_at = now()
    where id = $1::uuid
      and revoked_at is null
    returning id
    `,
    [sessionId],
  );
  return rows.length > 0;
}

export async function revokeAuthSessionByToken(
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  const tokenHash = hashSessionToken(token);
  const rows = await authQuery<{ id: string }>(
    `
    update auth_sessions
    set revoked_at = now()
    where token_hash = $1
      and revoked_at is null
    returning id
    `,
    [tokenHash],
  );
  return rows.length > 0;
}

export async function revokeOtherAuthSessions(
  keepSessionId: string,
): Promise<number> {
  const rows = await authQuery<{ id: string }>(
    `
    update auth_sessions
    set revoked_at = now()
    where revoked_at is null
      and expires_at > now()
      and id <> $1::uuid
    returning id
    `,
    [keepSessionId],
  );
  return rows.length;
}

export async function listActiveAuthSessions(): Promise<AuthSession[]> {
  const rows = await authQuery<AuthSessionRow>(
    `
    select id, username, role, user_agent, ip, created_at, last_seen_at, expires_at
    from auth_sessions
    where revoked_at is null
      and expires_at > now()
    order by last_seen_at desc
    limit 100
    `,
  );
  return rows.map(toSession);
}

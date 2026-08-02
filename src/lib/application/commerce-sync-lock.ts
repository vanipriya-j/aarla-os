import { query } from "@/lib/infra/db/pool";

export type CommerceSyncChannel = "shopify" | "delhivery" | "commerce";

export type CommerceSyncLockStatus = {
  locked: boolean;
  channel: CommerceSyncChannel | null;
  startedAt: string | null;
  updatedAt: string | null;
};

let ensuredTable = false;

/** Idempotent — covers production if /setup was not re-run after deploy. */
export async function ensureCommerceSyncLockTable(): Promise<void> {
  if (ensuredTable) return;
  await query(`
    create table if not exists commerce_sync_locks (
      id text primary key check (id = 'global'),
      holder text not null,
      channel text not null check (channel in ('shopify', 'delhivery', 'commerce')),
      started_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  ensuredTable = true;
}

async function clearStaleLocks(): Promise<void> {
  // Short TTL: a killed Vercel invocation should not block retries for 15 minutes.
  await query(
    `delete from commerce_sync_locks
     where id = 'global' and updated_at < now() - interval '3 minutes'`,
  );
}

/**
 * Acquire or renew the global commerce sync lock for a client-held token.
 * Same token may renew across Shopify/Delhivery chunks; a different token is rejected.
 */
export async function acquireOrRenewCommerceSyncLock(
  holder: string,
  channel: CommerceSyncChannel,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = holder.trim();
  if (!token) {
    return { ok: false, error: "Sync lock token is required." };
  }

  await ensureCommerceSyncLockTable();
  await clearStaleLocks();

  const renewed = await query<{ holder: string }>(
    `update commerce_sync_locks
     set channel = $2, updated_at = now()
     where id = 'global' and holder = $1
     returning holder`,
    [token, channel],
  );
  if (renewed.length) return { ok: true };

  const inserted = await query<{ holder: string }>(
    `insert into commerce_sync_locks (id, holder, channel)
     values ('global', $1, $2)
     on conflict (id) do nothing
     returning holder`,
    [token, channel],
  );
  if (inserted.length) return { ok: true };

  const current = await query<{ channel: string }>(
    `select channel from commerce_sync_locks where id = 'global'`,
  );
  const busy = current[0]?.channel ?? "commerce";
  return {
    ok: false,
    error:
      `A ${busy} sync is already in progress (or a previous run was killed mid-request). ` +
      `Wait ~3 minutes for auto-expiry, or click “Clear stuck sync lock”, then try again.`,
  };
}

export async function releaseCommerceSyncLock(holder: string): Promise<void> {
  const token = holder.trim();
  if (!token) return;
  await ensureCommerceSyncLockTable();
  await query(
    `delete from commerce_sync_locks where id = 'global' and holder = $1`,
    [token],
  );
}

/** Force-clear regardless of holder — recovery after Vercel timeouts. */
export async function forceClearCommerceSyncLock(): Promise<void> {
  await ensureCommerceSyncLockTable();
  await query(`delete from commerce_sync_locks where id = 'global'`);
}

export async function getCommerceSyncLockStatus(): Promise<CommerceSyncLockStatus> {
  await ensureCommerceSyncLockTable();
  await clearStaleLocks();
  const rows = await query<{
    channel: string;
    started_at: Date | string;
    updated_at: Date | string;
  }>(
    `select channel, started_at, updated_at from commerce_sync_locks where id = 'global'`,
  );
  const row = rows[0];
  if (!row) {
    return { locked: false, channel: null, startedAt: null, updatedAt: null };
  }
  const toIso = (value: Date | string) =>
    value instanceof Date ? value.toISOString() : String(value);
  return {
    locked: true,
    channel: row.channel as CommerceSyncChannel,
    startedAt: toIso(row.started_at),
    updatedAt: toIso(row.updated_at),
  };
}

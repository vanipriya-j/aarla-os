import { query } from "@/lib/infra/db/pool";

export type CommerceSyncChannel = "shopify" | "delhivery" | "commerce";

export type CommerceSyncLockStatus = {
  locked: boolean;
  channel: CommerceSyncChannel | null;
  startedAt: string | null;
};

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

  await query(
    `delete from commerce_sync_locks
     where id = 'global' and updated_at < now() - interval '15 minutes'`,
  );

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
    error: `A ${busy} sync is already in progress. Wait for it to finish before starting another.`,
  };
}

export async function releaseCommerceSyncLock(holder: string): Promise<void> {
  const token = holder.trim();
  if (!token) return;
  await query(
    `delete from commerce_sync_locks where id = 'global' and holder = $1`,
    [token],
  );
}

export async function getCommerceSyncLockStatus(): Promise<CommerceSyncLockStatus> {
  await query(
    `delete from commerce_sync_locks
     where id = 'global' and updated_at < now() - interval '15 minutes'`,
  );
  const rows = await query<{ channel: string; started_at: Date | string }>(
    `select channel, started_at from commerce_sync_locks where id = 'global'`,
  );
  const row = rows[0];
  if (!row) {
    return { locked: false, channel: null, startedAt: null };
  }
  return {
    locked: true,
    channel: row.channel as CommerceSyncChannel,
    startedAt:
      row.started_at instanceof Date
        ? row.started_at.toISOString()
        : String(row.started_at),
  };
}

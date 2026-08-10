import { ORG_ID } from "@/lib/infra/db/ids";
import { query } from "@/lib/infra/db/pool";

const CHANNEL = "shopify_orders" as const;
export const CHANNEL_ABANDONED = "shopify_abandoned_checkouts" as const;

let ensured = false;

export async function ensureCommerceSyncWatermarksTable(): Promise<void> {
  if (ensured) return;
  await query(`
    create table if not exists commerce_sync_watermarks (
      channel text primary key check (channel in ('shopify_orders', 'shopify_abandoned_checkouts')),
      organization_id uuid not null references organizations(id) on delete cascade,
      watermark_at timestamptz,
      run_id text,
      run_high_water_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `);
  // Widen an existing check constraint from an older migration (idempotent).
  await query(`
    alter table commerce_sync_watermarks drop constraint if exists commerce_sync_watermarks_channel_check
  `);
  await query(`
    alter table commerce_sync_watermarks
      add constraint commerce_sync_watermarks_channel_check
      check (channel in ('shopify_orders', 'shopify_abandoned_checkouts'))
  `);
  ensured = true;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Committed watermark only (no DB bootstrap). */
export async function getCommittedShopifyOrdersWatermark(): Promise<string | null> {
  await ensureCommerceSyncWatermarksTable();
  const rows = await query<{ watermark_at: Date | string | null }>(
    `select watermark_at from commerce_sync_watermarks
     where channel = $1 and organization_id = $2`,
    [CHANNEL, ORG_ID],
  );
  return toIso(rows[0]?.watermark_at ?? null);
}

/**
 * Watermark used for incremental sync:
 * committed value if present, otherwise bootstrap from max saved order_date
 * so a store that already synced does not re-walk the full catalog.
 */
export async function getShopifyOrdersWatermark(): Promise<string | null> {
  const committed = await getCommittedShopifyOrdersWatermark();
  if (committed) return committed;

  const maxRows = await query<{ m: Date | string | null }>(
    `select max(order_date) as m from external_orders
     where organization_id = $1 and provider = 'shopify'`,
    [ORG_ID],
  );
  return toIso(maxRows[0]?.m ?? null);
}

/**
 * Track the newest order seen in this sync run (lock token = run id).
 * Call on every chunk; commit only when the run finishes.
 */
export async function noteShopifyOrdersSyncProgress(input: {
  runId: string;
  maxOrderAt: string | null;
}): Promise<void> {
  await ensureCommerceSyncWatermarksTable();
  const runId = input.runId.trim();
  if (!runId) return;
  const maxOrderAt = toIso(input.maxOrderAt);
  if (!maxOrderAt) return;

  await query(
    `insert into commerce_sync_watermarks as w (
       channel, organization_id, run_id, run_high_water_at, updated_at
     ) values ($1, $2, $3, $4::timestamptz, now())
     on conflict (channel) do update set
       run_id = excluded.run_id,
       run_high_water_at = case
         when w.run_id is distinct from excluded.run_id then excluded.run_high_water_at
         when w.run_high_water_at is null then excluded.run_high_water_at
         when excluded.run_high_water_at > w.run_high_water_at then excluded.run_high_water_at
         else w.run_high_water_at
       end,
       updated_at = now()`,
    [CHANNEL, ORG_ID, runId, maxOrderAt],
  );
}

/** Promote this run's high-water mark to the committed watermark. */
export async function commitShopifyOrdersWatermark(runId: string): Promise<string | null> {
  await ensureCommerceSyncWatermarksTable();
  const token = runId.trim();
  if (!token) return null;

  const rows = await query<{ watermark_at: Date | string | null }>(
    `update commerce_sync_watermarks as w
     set
       watermark_at = case
         when w.run_id = $3 and w.run_high_water_at is not null
           and (w.watermark_at is null or w.run_high_water_at > w.watermark_at)
         then w.run_high_water_at
         else coalesce(w.watermark_at, w.run_high_water_at)
       end,
       run_id = null,
       run_high_water_at = null,
       updated_at = now()
     where w.channel = $1 and w.organization_id = $2 and w.run_id = $3
     returning watermark_at`,
    [CHANNEL, ORG_ID, token],
  );
  return toIso(rows[0]?.watermark_at ?? null);
}

/** Shopify search query for orders strictly after watermark (small overlap). */
export function shopifyOrdersCreatedAfterQuery(watermarkIso: string): string {
  const ms = new Date(watermarkIso).getTime();
  // 2-minute overlap so clock skew / same-second orders are not missed; upserts dedupe.
  const overlap = new Date(Math.max(0, ms - 120_000)).toISOString();
  return `created_at:>'${overlap}'`;
}

/** Committed watermark only (no DB bootstrap). */
export async function getCommittedShopifyAbandonedWatermark(): Promise<string | null> {
  await ensureCommerceSyncWatermarksTable();
  const rows = await query<{ watermark_at: Date | string | null }>(
    `select watermark_at from commerce_sync_watermarks
     where channel = $1 and organization_id = $2`,
    [CHANNEL_ABANDONED, ORG_ID],
  );
  return toIso(rows[0]?.watermark_at ?? null);
}

/**
 * Watermark used for incremental abandoned-checkout sync:
 * committed value if present, otherwise bootstrap from max saved last_activity_at
 * so a store that already synced does not re-walk the full history.
 */
export async function getShopifyAbandonedWatermark(): Promise<string | null> {
  const committed = await getCommittedShopifyAbandonedWatermark();
  if (committed) return committed;

  const maxRows = await query<{ m: Date | string | null }>(
    `select max(last_activity_at) as m from external_abandoned_checkouts
     where organization_id = $1 and provider = 'shopify'`,
    [ORG_ID],
  );
  return toIso(maxRows[0]?.m ?? null);
}

/**
 * Track the newest abandoned checkout seen in this sync run (lock token = run id).
 * Call on every chunk; commit only when the run finishes.
 */
export async function noteShopifyAbandonedSyncProgress(input: {
  runId: string;
  maxActivityAt: string | null;
}): Promise<void> {
  await ensureCommerceSyncWatermarksTable();
  const runId = input.runId.trim();
  if (!runId) return;
  const maxActivityAt = toIso(input.maxActivityAt);
  if (!maxActivityAt) return;

  await query(
    `insert into commerce_sync_watermarks as w (
       channel, organization_id, run_id, run_high_water_at, updated_at
     ) values ($1, $2, $3, $4::timestamptz, now())
     on conflict (channel) do update set
       run_id = excluded.run_id,
       run_high_water_at = case
         when w.run_id is distinct from excluded.run_id then excluded.run_high_water_at
         when w.run_high_water_at is null then excluded.run_high_water_at
         when excluded.run_high_water_at > w.run_high_water_at then excluded.run_high_water_at
         else w.run_high_water_at
       end,
       updated_at = now()`,
    [CHANNEL_ABANDONED, ORG_ID, runId, maxActivityAt],
  );
}

/** Promote this run's high-water mark to the committed watermark. */
export async function commitShopifyAbandonedWatermark(runId: string): Promise<string | null> {
  await ensureCommerceSyncWatermarksTable();
  const token = runId.trim();
  if (!token) return null;

  const rows = await query<{ watermark_at: Date | string | null }>(
    `update commerce_sync_watermarks as w
     set
       watermark_at = case
         when w.run_id = $3 and w.run_high_water_at is not null
           and (w.watermark_at is null or w.run_high_water_at > w.watermark_at)
         then w.run_high_water_at
         else coalesce(w.watermark_at, w.run_high_water_at)
       end,
       run_id = null,
       run_high_water_at = null,
       updated_at = now()
     where w.channel = $1 and w.organization_id = $2 and w.run_id = $3
     returning watermark_at`,
    [CHANNEL_ABANDONED, ORG_ID, token],
  );
  return toIso(rows[0]?.watermark_at ?? null);
}

/**
 * Shopify search query for abandoned checkouts strictly after watermark (small overlap).
 * Excludes checkouts that already recovered into an order.
 */
export function shopifyAbandonedCreatedAfterQuery(watermarkIso: string): string {
  const ms = new Date(watermarkIso).getTime();
  // 2-minute overlap so clock skew / same-second checkouts are not missed; upserts dedupe.
  const overlap = new Date(Math.max(0, ms - 120_000)).toISOString();
  return `recovery_state:not_recovered created_at:>'${overlap}'`;
}

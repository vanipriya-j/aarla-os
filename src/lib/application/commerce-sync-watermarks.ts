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
      run_next_cursor text,
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
  await query(`
    alter table commerce_sync_watermarks
      add column if not exists run_next_cursor text
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
 * Watermark used for incremental sync — committed value only.
 *
 * Never bootstrap from max(order_date): a timed-out newest-first chunk would
 * freeze incremental sync at ~one page of customers forever.
 * No committed watermark → incremental walks like full until a run completes.
 */
export async function getShopifyOrdersWatermark(): Promise<string | null> {
  return getCommittedShopifyOrdersWatermark();
}

/** Resume cursor for an interrupted catalog walk (survives Vercel timeouts). */
export async function getShopifyOrdersResumeCursor(): Promise<string | null> {
  await ensureCommerceSyncWatermarksTable();
  const rows = await query<{ run_next_cursor: string | null }>(
    `select run_next_cursor from commerce_sync_watermarks
     where channel = $1 and organization_id = $2`,
    [CHANNEL, ORG_ID],
  );
  const c = rows[0]?.run_next_cursor?.trim();
  return c || null;
}

export async function saveShopifyOrdersResumeCursor(
  cursor: string | null,
): Promise<void> {
  await ensureCommerceSyncWatermarksTable();
  const value = cursor?.trim() || null;
  await query(
    `insert into commerce_sync_watermarks as w (
       channel, organization_id, run_next_cursor, updated_at
     ) values ($1, $2, $3, now())
     on conflict (channel) do update set
       run_next_cursor = excluded.run_next_cursor,
       updated_at = now()`,
    [CHANNEL, ORG_ID, value],
  );
}

/** Clear a bad tip watermark so the next sync re-walks history. */
export async function clearShopifyOrdersWatermark(): Promise<void> {
  await ensureCommerceSyncWatermarksTable();
  await query(
    `update commerce_sync_watermarks
     set watermark_at = null, updated_at = now()
     where channel = $1 and organization_id = $2`,
    [CHANNEL, ORG_ID],
  );
}

/**
 * Track the newest order seen in this sync run (lock token = run id).
 * Call on every chunk; commit only when the run finishes.
 */
export async function noteShopifyOrdersSyncProgress(input: {
  runId: string;
  maxOrderAt: string | null;
  nextCursor?: string | null;
}): Promise<void> {
  await ensureCommerceSyncWatermarksTable();
  const runId = input.runId.trim();
  if (!runId) return;
  const maxOrderAt = toIso(input.maxOrderAt);
  const hasCursorUpdate = input.nextCursor !== undefined;
  const nextCursor = hasCursorUpdate ? input.nextCursor?.trim() || null : null;

  if (!maxOrderAt && !hasCursorUpdate) return;

  await query(
    `insert into commerce_sync_watermarks as w (
       channel, organization_id, run_id, run_high_water_at, run_next_cursor, updated_at
     ) values ($1, $2, $3, $4::timestamptz, $5, now())
     on conflict (channel) do update set
       run_id = excluded.run_id,
       run_high_water_at = case
         when excluded.run_high_water_at is null then w.run_high_water_at
         when w.run_id is distinct from excluded.run_id then excluded.run_high_water_at
         when w.run_high_water_at is null then excluded.run_high_water_at
         when excluded.run_high_water_at > w.run_high_water_at then excluded.run_high_water_at
         else w.run_high_water_at
       end,
       run_next_cursor = case
         when $6::boolean then excluded.run_next_cursor
         else w.run_next_cursor
       end,
       updated_at = now()`,
    [CHANNEL, ORG_ID, runId, maxOrderAt, nextCursor, hasCursorUpdate],
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
       run_next_cursor = null,
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
 * Abandoned incremental watermark — committed only (same bootstrap trap as orders).
 */
export async function getShopifyAbandonedWatermark(): Promise<string | null> {
  return getCommittedShopifyAbandonedWatermark();
}

export async function getShopifyAbandonedResumeCursor(): Promise<string | null> {
  await ensureCommerceSyncWatermarksTable();
  const rows = await query<{ run_next_cursor: string | null }>(
    `select run_next_cursor from commerce_sync_watermarks
     where channel = $1 and organization_id = $2`,
    [CHANNEL_ABANDONED, ORG_ID],
  );
  const c = rows[0]?.run_next_cursor?.trim();
  return c || null;
}

export async function saveShopifyAbandonedResumeCursor(
  cursor: string | null,
): Promise<void> {
  await ensureCommerceSyncWatermarksTable();
  const value = cursor?.trim() || null;
  await query(
    `insert into commerce_sync_watermarks as w (
       channel, organization_id, run_next_cursor, updated_at
     ) values ($1, $2, $3, now())
     on conflict (channel) do update set
       run_next_cursor = excluded.run_next_cursor,
       updated_at = now()`,
    [CHANNEL_ABANDONED, ORG_ID, value],
  );
}

export async function clearShopifyAbandonedWatermark(): Promise<void> {
  await ensureCommerceSyncWatermarksTable();
  await query(
    `update commerce_sync_watermarks
     set watermark_at = null, updated_at = now()
     where channel = $1 and organization_id = $2`,
    [CHANNEL_ABANDONED, ORG_ID],
  );
}

/**
 * Track the newest abandoned checkout seen in this sync run (lock token = run id).
 * Call on every chunk; commit only when the run finishes.
 */
export async function noteShopifyAbandonedSyncProgress(input: {
  runId: string;
  maxActivityAt: string | null;
  nextCursor?: string | null;
}): Promise<void> {
  await ensureCommerceSyncWatermarksTable();
  const runId = input.runId.trim();
  if (!runId) return;
  const maxActivityAt = toIso(input.maxActivityAt);
  const hasCursorUpdate = input.nextCursor !== undefined;
  const nextCursor = hasCursorUpdate ? input.nextCursor?.trim() || null : null;

  if (!maxActivityAt && !hasCursorUpdate) return;

  await query(
    `insert into commerce_sync_watermarks as w (
       channel, organization_id, run_id, run_high_water_at, run_next_cursor, updated_at
     ) values ($1, $2, $3, $4::timestamptz, $5, now())
     on conflict (channel) do update set
       run_id = excluded.run_id,
       run_high_water_at = case
         when excluded.run_high_water_at is null then w.run_high_water_at
         when w.run_id is distinct from excluded.run_id then excluded.run_high_water_at
         when w.run_high_water_at is null then excluded.run_high_water_at
         when excluded.run_high_water_at > w.run_high_water_at then excluded.run_high_water_at
         else w.run_high_water_at
       end,
       run_next_cursor = case
         when $6::boolean then excluded.run_next_cursor
         else w.run_next_cursor
       end,
       updated_at = now()`,
    [CHANNEL_ABANDONED, ORG_ID, runId, maxActivityAt, nextCursor, hasCursorUpdate],
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
       run_next_cursor = null,
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

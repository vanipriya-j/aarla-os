/**
 * Founder-facing sync progress copy — never mention chunks/cursors.
 */

export function formatOrdersLoaded(loaded: number, total?: number | null): string {
  if (total != null && Number.isFinite(total) && total >= 0) {
    return `Loaded ${loaded} of ${total} orders`;
  }
  return `Loaded ${loaded} orders`;
}

/** Suffix for Sync All status — catch-up vs true incremental. */
export function formatOrdersSyncMode(incrementalFrom?: string | null): string {
  if (incrementalFrom) {
    return ` (new since ${new Date(incrementalFrom).toLocaleString()})`;
  }
  return " (catch-up — full history until watermark is set)";
}

export function formatAwbsTracked(done: number, total?: number | null): string {
  if (total != null && Number.isFinite(total) && total >= 0) {
    return `Tracked ${done} of ${total} AWBs`;
  }
  return `Tracked ${done} AWBs`;
}

export function formatCheckoutsLoaded(loaded: number): string {
  return `Loaded ${loaded} abandoned checkouts`;
}

/**
 * Founder-facing sync progress copy — never mention chunks/cursors.
 */

export function formatOrdersLoaded(loaded: number, total?: number | null): string {
  if (total != null && Number.isFinite(total) && total >= 0) {
    return `Loaded ${loaded} of ${total} orders`;
  }
  return `Loaded ${loaded} orders`;
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

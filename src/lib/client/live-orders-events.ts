/**
 * Cross-page signal: live order tick finished → Fulfil list should refresh.
 * Dispatched from LiveOrdersWatch; listened on /fulfil.
 */
export const LIVE_ORDERS_UPDATED_EVENT = "aarla:live-orders-updated";

export type LiveOrdersUpdatedDetail = {
  fulfilCreated: number;
  openCount: number;
  openOrderNumbers: string[];
  syncedAt: string;
};

export function dispatchLiveOrdersUpdated(detail: LiveOrdersUpdatedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(LIVE_ORDERS_UPDATED_EVENT, { detail }),
  );
}

/**
 * Commerce channel adapter port.
 *
 * Aarla OS is the system of record. External platforms (Shopify, etc.) plug in
 * behind this interface and must remain replaceable.
 *
 * Do not import Shopify (or any vendor SDK) from domain or UI metric paths.
 * Inventory truth is written only through the Aarla OS ledger.
 */

import type {
  ChannelProductMapping,
  CommerceChannelId,
  CommerceSyncConflict,
  SalesOrder,
} from "@/lib/domain/types";

export interface CommerceChannelAdapter {
  readonly channelId: CommerceChannelId;

  /** Map external product/variant ids → canonical Aarla OS ids. */
  resolveProductMapping(external: {
    productId: string;
    variantId?: string;
  }): ChannelProductMapping | null;

  /**
   * Pull orders from the channel and return canonical SalesOrders.
   * Callers persist SalesOrders in Aarla OS and write stock via the ledger —
   * the adapter must not mutate inventory directly.
   */
  importOrders(since?: string): Promise<SalesOrder[]>;

  /**
   * Push fulfilment / shipment updates outward to the channel.
   * Inventory quantities never flow the other way as business truth.
   */
  pushFulfilmentUpdate(order: SalesOrder): Promise<void>;

  /** Conflicts must be listable for audit UIs. */
  listConflicts(): Promise<CommerceSyncConflict[]>;
}

/** Placeholder adapter — preserves the seam until a real channel is wired. */
export class UnimplementedCommerceAdapter implements CommerceChannelAdapter {
  constructor(public readonly channelId: CommerceChannelId) {}

  resolveProductMapping(): ChannelProductMapping | null {
    return null;
  }

  async importOrders(): Promise<SalesOrder[]> {
    throw new Error(
      `Commerce adapter '${this.channelId}' is not implemented. Aarla OS remains the system of record.`,
    );
  }

  async pushFulfilmentUpdate(): Promise<void> {
    throw new Error(
      `Commerce adapter '${this.channelId}' is not implemented. Fulfilment sync is deferred.`,
    );
  }

  async listConflicts(): Promise<CommerceSyncConflict[]> {
    return [];
  }
}

/** Registry so Shopify (or another channel) can be swapped without UI changes. */
const adapters = new Map<CommerceChannelId, CommerceChannelAdapter>();

export function registerCommerceAdapter(adapter: CommerceChannelAdapter) {
  adapters.set(adapter.channelId, adapter);
}

export function getCommerceAdapter(channelId: CommerceChannelId): CommerceChannelAdapter {
  return adapters.get(channelId) ?? new UnimplementedCommerceAdapter(channelId);
}

export function listRegisteredCommerceAdapters(): CommerceChannelId[] {
  return Array.from(adapters.keys());
}

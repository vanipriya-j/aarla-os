/**
 * Soft channel reservation types (Shopify Reserve → Aarla OS).
 * No stock_movements — Studio available is checked, then a reservation row is stored.
 */

export type ChannelReservationProvider = "shopify";

export type ChannelReservationStatus = "active" | "released" | "expired";

export interface ChannelReservation {
  id: string;
  provider: ChannelReservationProvider;
  externalReference: string;
  productId: string;
  variantId: string | null;
  sku: string;
  quantity: number;
  status: ChannelReservationStatus;
  studioAvailableAtRequest: number | null;
  contactPhone: string | null;
  contactName: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** True when this response reused an existing row for the same externalReference. */
  idempotentReplay: boolean;
}

export interface CreateChannelReservationInput {
  externalReference: string;
  quantity: number;
  /** Domain product code (preferred with optional variantId). */
  productId?: string;
  /** Domain variant code. */
  variantId?: string;
  /** Lookup by variant SKU first, then product SKU. */
  sku?: string;
  contactPhone?: string;
  contactName?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export type CreateChannelReservationResult =
  | { ok: true; reservation: ChannelReservation; continueWhatsApp: true }
  | {
      ok: false;
      code:
        | "validation_error"
        | "product_not_found"
        | "insufficient_stock"
        | "conflict";
      error: string;
      continueWhatsApp: true;
      studioAvailable?: number;
      requested?: number;
    };

export interface ResolvedCatalogTarget {
  productId: string;
  variantId: string | null;
  sku: string;
  title: string;
}

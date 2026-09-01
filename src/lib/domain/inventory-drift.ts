/**
 * Pure inventory mismatch comparison — Shopify available vs Aarla Studio ATP.
 * Used as a review board for one-time Admin fixes; not a required two-way sync.
 */

export type InventoryDriftRow = {
  productId: string;
  variantId: string;
  label: string;
  sku: string;
  shopifyVariantId: string;
  inventoryItemId: string | null;
  locationId: string | null;
  aarlaStudio: number;
  shopifyAvailable: number;
  delta: number; // shopify - aarla (positive = Shopify has more)
  status: "match" | "aarla_higher" | "shopify_higher";
};

export function compareInventoryDrift(input: {
  rows: Array<{
    productId: string;
    variantId: string;
    label: string;
    sku: string;
    shopifyVariantId: string;
    inventoryItemId?: string | null;
    locationId?: string | null;
    aarlaStudio: number;
    shopifyAvailable: number;
  }>;
}): InventoryDriftRow[] {
  return input.rows
    .map((r) => {
      const aarlaStudio = Math.max(0, Math.floor(r.aarlaStudio));
      const shopifyAvailable = Math.max(0, Math.floor(r.shopifyAvailable));
      const delta = shopifyAvailable - aarlaStudio;
      const status: InventoryDriftRow["status"] =
        delta === 0 ? "match" : delta > 0 ? "shopify_higher" : "aarla_higher";
      return {
        productId: r.productId,
        variantId: r.variantId,
        label: r.label,
        sku: r.sku,
        shopifyVariantId: r.shopifyVariantId,
        inventoryItemId: r.inventoryItemId ?? null,
        locationId: r.locationId ?? null,
        aarlaStudio,
        shopifyAvailable,
        delta,
        status,
      };
    })
    .sort((a, b) => {
      const rank = (s: InventoryDriftRow["status"]) =>
        s === "match" ? 2 : s === "shopify_higher" ? 0 : 1;
      return rank(a.status) - rank(b.status) || a.label.localeCompare(b.label);
    });
}

export function summarizeInventoryDrift(rows: InventoryDriftRow[]): {
  total: number;
  matched: number;
  drifted: number;
  aarlaHigher: number;
  shopifyHigher: number;
} {
  return {
    total: rows.length,
    matched: rows.filter((r) => r.status === "match").length,
    drifted: rows.filter((r) => r.status !== "match").length,
    aarlaHigher: rows.filter((r) => r.status === "aarla_higher").length,
    shopifyHigher: rows.filter((r) => r.status === "shopify_higher").length,
  };
}

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
  /** How many Shopify variants collapsed into this Aarla row (SKU collisions). */
  shopifyLinkCount: number;
};

type DriftInputRow = {
  productId: string;
  variantId: string;
  label: string;
  sku: string;
  shopifyVariantId: string;
  inventoryItemId?: string | null;
  locationId?: string | null;
  aarlaStudio: number;
  shopifyAvailable: number;
};

/**
 * One Aarla variant should appear once. If several Shopify variants map to it
 * (duplicate SKUs / weak matching), sum Shopify available and keep one row.
 */
export function collapseShopifyRowsByAarlaVariant(rows: DriftInputRow[]): Array<
  DriftInputRow & { shopifyLinkCount: number }
> {
  const byKey = new Map<
    string,
    DriftInputRow & { shopifyLinkCount: number; shopifyIds: Set<string> }
  >();

  for (const r of rows) {
    const key = `${r.productId}::${r.variantId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...r,
        shopifyAvailable: Math.max(0, Math.floor(r.shopifyAvailable)),
        aarlaStudio: Math.max(0, Math.floor(r.aarlaStudio)),
        shopifyLinkCount: 1,
        shopifyIds: new Set([r.shopifyVariantId]),
      });
      continue;
    }
    existing.shopifyAvailable += Math.max(0, Math.floor(r.shopifyAvailable));
    if (!existing.shopifyIds.has(r.shopifyVariantId)) {
      existing.shopifyIds.add(r.shopifyVariantId);
      existing.shopifyLinkCount = existing.shopifyIds.size;
    }
    // Prefer a linked inventory item id when present.
    if (!existing.inventoryItemId && r.inventoryItemId) {
      existing.inventoryItemId = r.inventoryItemId;
    }
    if (!existing.locationId && r.locationId) {
      existing.locationId = r.locationId;
    }
  }

  return Array.from(byKey.values()).map(({ shopifyIds: _ids, ...rest }) => rest);
}

export function compareInventoryDrift(input: {
  rows: DriftInputRow[];
}): InventoryDriftRow[] {
  const collapsed = collapseShopifyRowsByAarlaVariant(input.rows);
  return collapsed
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
        shopifyLinkCount: r.shopifyLinkCount,
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

/**
 * Re-collapse after multi-page client collection — each API chunk collapses
 * internally, but the same Aarla variant can reappear on later Shopify pages.
 */
export function mergeInventoryDriftPages(rows: InventoryDriftRow[]): InventoryDriftRow[] {
  const byKey = new Map<string, InventoryDriftRow>();

  for (const r of rows) {
    const key = `${r.productId}::${r.variantId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r });
      continue;
    }
    existing.shopifyAvailable += Math.max(0, Math.floor(r.shopifyAvailable));
    existing.shopifyLinkCount += Math.max(1, r.shopifyLinkCount || 1);
    if (!existing.inventoryItemId && r.inventoryItemId) {
      existing.inventoryItemId = r.inventoryItemId;
    }
    const delta = existing.shopifyAvailable - existing.aarlaStudio;
    existing.delta = delta;
    existing.status = delta === 0 ? "match" : delta > 0 ? "shopify_higher" : "aarla_higher";
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const rank = (s: InventoryDriftRow["status"]) =>
      s === "match" ? 2 : s === "shopify_higher" ? 0 : 1;
    return rank(a.status) - rank(b.status) || a.label.localeCompare(b.label);
  });
}

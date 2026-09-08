import type { InventoryBalance, Product } from "@/lib/domain/types";

export type PartnerStockOption = {
  productId: string;
  productTitle: string;
  variantId: string;
  variantLabel: string;
  sku: string;
  available: number;
};

function variantLabelFor(
  product: Product | undefined,
  variantId: string,
): { label: string; sku: string } {
  if (!variantId) return { label: "No variant", sku: "" };
  const variant = product?.variants.find((v) => v.id === variantId);
  if (!variant) return { label: variantId, sku: "" };
  return { label: variant.label || variantId, sku: variant.sku || "" };
}

/** Positive balances at a location → selectable product×variant rows. */
export function buildAvailableStockOptions(
  products: Product[],
  balances: InventoryBalance[],
  locationId: string,
): PartnerStockOption[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows: PartnerStockOption[] = [];

  for (const b of balances) {
    if (b.locationId !== locationId || b.quantity <= 0) continue;
    const product = byId.get(b.productId);
    const { label, sku } = variantLabelFor(product, b.variantId);
    rows.push({
      productId: b.productId,
      productTitle: product?.title ?? b.productId,
      variantId: b.variantId,
      variantLabel: label,
      sku,
      available: b.quantity,
    });
  }

  return rows.sort((a, b) => {
    const title = a.productTitle.localeCompare(b.productTitle);
    if (title !== 0) return title;
    return a.variantLabel.localeCompare(b.variantLabel);
  });
}

/** Catalog product×variant rows for legacy opening (no stock gate). */
export function buildCatalogStockOptions(products: Product[]): PartnerStockOption[] {
  const rows: PartnerStockOption[] = [];
  for (const product of products) {
    if (!product.variants.length) {
      rows.push({
        productId: product.id,
        productTitle: product.title,
        variantId: "",
        variantLabel: "No variant",
        sku: product.sku || "",
        available: 0,
      });
      continue;
    }
    for (const variant of product.variants) {
      rows.push({
        productId: product.id,
        productTitle: product.title,
        variantId: variant.id,
        variantLabel: variant.label || variant.id,
        sku: variant.sku || "",
        available: 0,
      });
    }
  }
  return rows;
}

/** Catalog search without dumping the full product×variant matrix into the UI. */
export function searchCatalogStockOptions(
  products: Product[],
  query: string,
  limit = 25,
): PartnerStockOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const rows: PartnerStockOption[] = [];
  for (const product of products) {
    if (rows.length >= limit) break;
    if (!product.variants.length) {
      const haystack = `${product.title} ${product.sku} ${product.id}`.toLowerCase();
      if (tokens.every((t) => haystack.includes(t))) {
        rows.push({
          productId: product.id,
          productTitle: product.title,
          variantId: "",
          variantLabel: "No variant",
          sku: product.sku || "",
          available: 0,
        });
      }
      continue;
    }
    for (const variant of product.variants) {
      if (rows.length >= limit) break;
      const label = variant.label || variant.id;
      const haystack =
        `${product.title} ${label} ${variant.sku || ""} ${product.sku || ""}`.toLowerCase();
      if (!tokens.every((t) => haystack.includes(t))) continue;
      rows.push({
        productId: product.id,
        productTitle: product.title,
        variantId: variant.id,
        variantLabel: label,
        sku: variant.sku || "",
        available: 0,
      });
    }
  }
  return rows;
}

export function filterStockOptions(
  options: PartnerStockOption[],
  query: string,
  limit = 25,
): PartnerStockOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  const matched = options.filter((o) => {
    const haystack =
      `${o.productTitle} ${o.variantLabel} ${o.sku} ${o.productId}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
  return matched.slice(0, limit);
}

export function optionKey(o: Pick<PartnerStockOption, "productId" | "variantId">): string {
  return `${o.productId}::${o.variantId}`;
}

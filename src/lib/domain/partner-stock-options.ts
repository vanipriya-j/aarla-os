import type { InventoryBalance, Location, Product } from "@/lib/domain/types";
import { LOC } from "@/lib/domain/catalog";
import { studioLedgerAvailable } from "@/lib/domain/channel-reservation";

export type PartnerStockOption = {
  productId: string;
  productTitle: string;
  variantId: string;
  variantLabel: string;
  sku: string;
  available: number;
};

/** Slim catalog shape shared by Partners, Manufacture, Campaigns. */
export type CatalogProductLike = {
  id: string;
  title: string;
  sku?: string;
  variants: Array<{ id: string; label: string; sku?: string }>;
};

/** Prefer loc-studio, then any location marked Studio (same pool Inventory uses). */
export function resolveStudioLocationIds(locations: Location[]): string[] {
  const ids = new Set<string>();
  if (locations.some((l) => l.id === LOC.studio)) ids.add(LOC.studio);
  for (const loc of locations) {
    if (loc.kind === "Studio") ids.add(loc.id);
  }
  if (!ids.size) ids.add(LOC.studio);
  return [...ids];
}

function variantLabelFor(
  product: CatalogProductLike | undefined,
  variantId: string,
): { label: string; sku: string } {
  if (!variantId) return { label: "No variant", sku: "" };
  const variant = product?.variants.find((v) => v.id === variantId);
  if (!variant) return { label: variantId, sku: "" };
  return { label: variant.label || variantId, sku: variant.sku || "" };
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesQuery(haystack: string, query: string): boolean {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const hay = normalizeSearchText(haystack);
  return tokens.every((t) => hay.includes(t));
}

/** Positive balances at one or more locations → selectable product×variant rows. */
export function buildAvailableStockOptions(
  products: Product[],
  balances: InventoryBalance[],
  locationId: string | string[],
): PartnerStockOption[] {
  const locationIds = Array.isArray(locationId) ? locationId : [locationId];
  const locationSet = new Set(locationIds);
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows: PartnerStockOption[] = [];
  const seen = new Set<string>();

  for (const b of balances) {
    if (!locationSet.has(b.locationId) || b.quantity <= 0) continue;
    const product = byId.get(b.productId);
    let variantId = b.variantId;
    // Product-level ledger qty on a single-variant product → attach to that variant.
    if (!variantId && product?.variants.length === 1) {
      variantId = product.variants[0]!.id;
    }
    const key = `${b.productId}::${variantId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const available = locationIds.reduce((sum, loc) => {
      if (product) {
        return (
          sum + studioLedgerAvailable(balances, products, b.productId, variantId || null, loc)
        );
      }
      return (
        sum +
        balances
          .filter(
            (x) =>
              x.productId === b.productId &&
              x.locationId === loc &&
              (x.variantId === b.variantId || x.variantId === variantId),
          )
          .reduce((s, x) => s + Math.max(0, x.quantity), 0)
      );
    }, 0);
    if (available <= 0) continue;

    const { label, sku } = variantLabelFor(product, variantId);
    rows.push({
      productId: b.productId,
      productTitle: product?.title ?? b.productId,
      variantId,
      variantLabel: label,
      sku: sku || product?.sku || "",
      available,
    });
  }

  return rows.sort((a, b) => {
    const title = a.productTitle.localeCompare(b.productTitle);
    if (title !== 0) return title;
    return a.variantLabel.localeCompare(b.variantLabel);
  });
}

/** Catalog product×variant rows (no stock gate). */
export function buildCatalogStockOptions(products: CatalogProductLike[]): PartnerStockOption[] {
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
  products: CatalogProductLike[],
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
      const haystack = `${product.title} ${product.sku || ""} ${product.id}`.toLowerCase();
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

/** Search in-stock rows first (Inventory Studio truth), then catalog zero-qty matches. */
export function searchStockOptionsAtLocation(
  products: Product[],
  balances: InventoryBalance[],
  locationId: string | string[],
  query: string,
  limit = 25,
): PartnerStockOption[] {
  const q = query.trim();
  if (!q) return [];

  const inStock = buildAvailableStockOptions(products, balances, locationId).filter((row) =>
    matchesQuery(
      `${row.productTitle} ${row.variantLabel} ${row.sku} ${row.productId}`,
      q,
    ),
  );

  if (inStock.length >= limit) return inStock.slice(0, limit);

  const locationIds = Array.isArray(locationId) ? locationId : [locationId];
  const seen = new Set(inStock.map((r) => `${r.productId}::${r.variantId}`));
  const outOfStock: PartnerStockOption[] = [];

  for (const product of products) {
    const variants =
      product.variants.length > 0
        ? product.variants
        : [{ id: "", label: "No variant", sku: product.sku || "" }];
    for (const variant of variants) {
      const variantId = variant.id || "";
      const key = `${product.id}::${variantId}`;
      if (seen.has(key)) continue;
      const label = variant.label || (variantId ? variantId : "No variant");
      if (
        !matchesQuery(
          `${product.title} ${label} ${variant.sku || ""} ${product.sku || ""} ${product.id}`,
          q,
        )
      ) {
        continue;
      }
      const available = locationIds.reduce(
        (sum, loc) =>
          sum + studioLedgerAvailable(balances, products, product.id, variantId || null, loc),
        0,
      );
      if (available > 0) continue;
      outOfStock.push({
        productId: product.id,
        productTitle: product.title,
        variantId,
        variantLabel: label,
        sku: variant.sku || product.sku || "",
        available: 0,
      });
      seen.add(key);
      if (inStock.length + outOfStock.length >= limit) {
        return [...inStock, ...outOfStock];
      }
    }
  }

  return [...inStock, ...outOfStock];
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

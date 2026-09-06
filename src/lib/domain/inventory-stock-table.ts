/**
 * Client-side helpers for the unified Inventory Stock table.
 * Balances still come from the ledger; this only shapes/filter/sorts rows.
 */

import type {
  Product,
  ReorderRule,
  StockMovement,
  Location,
  VariantStockCell,
} from "@/lib/domain/types";
import { deriveVariantTotals } from "@/lib/domain/ledger";
import {
  buildApparelMatrix,
  resolvePresentation,
  type ApparelMatrixRow,
} from "@/lib/domain/inventory-presentation";

export type StockStockFilter = "all" | "in-stock" | "zero" | "low";

export type StockSortKey =
  | "title-asc"
  | "title-desc"
  | "category-asc"
  | "total-desc"
  | "total-asc"
  | "studio-desc"
  | "sku-asc";

export type StockTableRow = {
  key: string;
  productId: string;
  productTitle: string;
  productSku: string;
  category: string;
  status: string;
  variantId: string;
  variantLabel: string;
  variantSku: string;
  studio: number;
  partner: number;
  channel: number;
  damaged: number;
  total: number;
  lowStock: boolean;
  cell: VariantStockCell;
  product: Product;
  shopifyAdminUrl: string | null;
  shopifyVariantId: string | null;
};

/** Flat variant row, or one apparel product collapsed into a Colour × Size matrix. */
export type StockCatalogEntry =
  | { kind: "variant"; key: string; row: StockTableRow }
  | {
      kind: "apparel";
      key: string;
      product: Product;
      matrix: ApparelMatrixRow[];
      variantRows: StockTableRow[];
      studio: number;
      partner: number;
      channel: number;
      damaged: number;
      total: number;
      lowStock: boolean;
      lowStockVariantIds: string[];
      shopifyAdminUrl: string | null;
    };

function minQtyFor(rules: ReorderRule[], productId: string, variantId: string): number | undefined {
  const exact = rules.find(
    (r) => !r.partnerId && r.productId === productId && r.variantId === variantId,
  );
  if (exact) return exact.minQuantity;
  const productLevel = rules.find((r) => !r.partnerId && r.productId === productId && !r.variantId);
  return productLevel?.minQuantity;
}

export function buildStockTableRows(input: {
  products: Product[];
  movements: StockMovement[];
  locations: Location[];
  reorderRules: ReorderRule[];
}): StockTableRow[] {
  const rows: StockTableRow[] = [];
  for (const product of input.products) {
    const cells = deriveVariantTotals(
      input.movements,
      product.id,
      product.variants,
      input.locations,
    );
    for (const cell of cells) {
      const variant = product.variants.find((v) => v.id === cell.variantId);
      const min = minQtyFor(input.reorderRules, product.id, cell.variantId);
      rows.push({
        key: `${product.id}:${cell.variantId}`,
        productId: product.id,
        productTitle: product.title,
        productSku: product.sku,
        category: product.category || "Uncategorised",
        status: product.status,
        variantId: cell.variantId,
        variantLabel: variant?.label ?? cell.variantId,
        variantSku: variant?.sku ?? "",
        studio: cell.studio,
        partner: cell.partner,
        channel: cell.channel,
        damaged: cell.damaged,
        total: cell.total,
        lowStock: min !== undefined && cell.total < min,
        cell,
        product,
        shopifyAdminUrl: product.shopifyAdminUrl ?? null,
        shopifyVariantId: variant?.shopifyVariantId ?? null,
      });
    }
  }
  return rows;
}

/**
 * Collapse apparel (T-shirt) products into Colour × Size matrix entries so the
 * stock screen is not one endless row per size. Other products stay flat.
 */
export function buildStockCatalogEntries(rows: StockTableRow[]): StockCatalogEntry[] {
  const byProduct = new Map<string, StockTableRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push(row);
    byProduct.set(row.productId, list);
  }

  const entries: StockCatalogEntry[] = [];
  for (const [, variantRows] of byProduct) {
    const product = variantRows[0]!.product;
    if (resolvePresentation(product) === "matrix-apparel") {
      const cells = variantRows.map((r) => r.cell);
      const matrix = buildApparelMatrix(product, cells);
      if (matrix.length > 0) {
        const lowStockVariantIds = variantRows.filter((r) => r.lowStock).map((r) => r.variantId);
        entries.push({
          kind: "apparel",
          key: `apparel:${product.id}`,
          product,
          matrix,
          variantRows,
          studio: variantRows.reduce((s, r) => s + r.studio, 0),
          partner: variantRows.reduce((s, r) => s + r.partner, 0),
          channel: variantRows.reduce((s, r) => s + r.channel, 0),
          damaged: variantRows.reduce((s, r) => s + r.damaged, 0),
          total: variantRows.reduce((s, r) => s + r.total, 0),
          lowStock: lowStockVariantIds.length > 0,
          lowStockVariantIds,
          shopifyAdminUrl: product.shopifyAdminUrl ?? null,
        });
        continue;
      }
    }
    for (const row of variantRows) {
      entries.push({ kind: "variant", key: row.key, row });
    }
  }
  return entries;
}

/**
 * When filtering Zero/Low, keep the full apparel matrix for a product if any
 * size matches — otherwise founders only see orphan sizes.
 */
export function rowsForStockCatalogView(
  allRows: StockTableRow[],
  filteredRows: StockTableRow[],
): StockTableRow[] {
  const matchedProductIds = new Set(
    filteredRows
      .filter((r) => resolvePresentation(r.product) === "matrix-apparel")
      .map((r) => r.productId),
  );
  if (!matchedProductIds.size) return filteredRows;
  const extras = allRows.filter(
    (r) => matchedProductIds.has(r.productId) && !filteredRows.some((f) => f.key === r.key),
  );
  return extras.length ? [...filteredRows, ...extras] : filteredRows;
}

export function uniqueStockCategories(rows: StockTableRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.category))).sort((a, b) => a.localeCompare(b));
}

export function filterStockTableRows(
  rows: StockTableRow[],
  options: {
    category: string | "all";
    query: string;
    stock: StockStockFilter;
  },
): StockTableRow[] {
  const q = options.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (options.category !== "all" && row.category !== options.category) return false;
    if (options.stock === "in-stock" && row.total <= 0) return false;
    if (options.stock === "zero" && row.total !== 0) return false;
    if (options.stock === "low" && !row.lowStock) return false;
    if (!q) return true;
    return (
      row.productTitle.toLowerCase().includes(q) ||
      row.productSku.toLowerCase().includes(q) ||
      row.variantLabel.toLowerCase().includes(q) ||
      row.variantSku.toLowerCase().includes(q) ||
      row.category.toLowerCase().includes(q)
    );
  });
}

export function sortStockTableRows(rows: StockTableRow[], sort: StockSortKey): StockTableRow[] {
  const copy = [...rows];
  const byTitle = (a: StockTableRow, b: StockTableRow) =>
    a.productTitle.localeCompare(b.productTitle) || a.variantLabel.localeCompare(b.variantLabel);
  copy.sort((a, b) => {
    switch (sort) {
      case "title-desc":
        return byTitle(b, a);
      case "category-asc":
        return a.category.localeCompare(b.category) || byTitle(a, b);
      case "total-desc":
        return b.total - a.total || byTitle(a, b);
      case "total-asc":
        return a.total - b.total || byTitle(a, b);
      case "studio-desc":
        return b.studio - a.studio || byTitle(a, b);
      case "sku-asc":
        return (
          a.variantSku.localeCompare(b.variantSku) ||
          a.productSku.localeCompare(b.productSku) ||
          byTitle(a, b)
        );
      case "title-asc":
      default:
        return byTitle(a, b);
    }
  });
  return copy;
}

/** Sort catalog entries (apparel blocks + flat variants) for the stock screen. */
export function sortStockCatalogEntries(
  entries: StockCatalogEntry[],
  sort: StockSortKey,
): StockCatalogEntry[] {
  const copy = [...entries];
  const title = (e: StockCatalogEntry) =>
    e.kind === "apparel" ? e.product.title : e.row.productTitle;
  const category = (e: StockCatalogEntry) =>
    e.kind === "apparel" ? e.product.category || "Uncategorised" : e.row.category;
  const total = (e: StockCatalogEntry) => (e.kind === "apparel" ? e.total : e.row.total);
  const studio = (e: StockCatalogEntry) => (e.kind === "apparel" ? e.studio : e.row.studio);
  const sku = (e: StockCatalogEntry) =>
    e.kind === "apparel" ? e.product.sku : e.row.variantSku || e.row.productSku;

  copy.sort((a, b) => {
    switch (sort) {
      case "title-desc":
        return title(b).localeCompare(title(a));
      case "category-asc":
        return category(a).localeCompare(category(b)) || title(a).localeCompare(title(b));
      case "total-desc":
        return total(b) - total(a) || title(a).localeCompare(title(b));
      case "total-asc":
        return total(a) - total(b) || title(a).localeCompare(title(b));
      case "studio-desc":
        return studio(b) - studio(a) || title(a).localeCompare(title(b));
      case "sku-asc":
        return sku(a).localeCompare(sku(b)) || title(a).localeCompare(title(b));
      case "title-asc":
      default:
        return title(a).localeCompare(title(b));
    }
  });
  return copy;
}

export function paginateStockTableRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { pageRows: T[]; page: number; totalPages: number; total: number } {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageRows: rows.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
  };
}

export const STOCK_TABLE_PAGE_SIZE = 25;

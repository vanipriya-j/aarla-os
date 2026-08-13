/**
 * Inventory & Replenishment — presentation resolution.
 * Decides how a product's variants render on the Inventory screen:
 * apparel/art size-colour matrices, or a plain variant list.
 */
import type { InventoryPresentation, Product, ProductVariant, VariantStockCell } from "./types";

const APPAREL_CATEGORY_RE = /t-?shirt|apparel|tee/i;
const ART_CATEGORY_RE = /framed|art/i;

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

function hasOption(variants: ProductVariant[], key: string): boolean {
  return variants.some((v) => Boolean(v.options?.[key]));
}

/** Resolve how a product's variants should render on the Inventory screen. */
export function resolvePresentation(product: Pick<Product, "category" | "variants" | "inventoryPresentation">): InventoryPresentation {
  const override = product.inventoryPresentation;
  if (override && override !== "auto") return override;

  const variants = product.variants ?? [];

  if (
    APPAREL_CATEGORY_RE.test(product.category) ||
    (hasOption(variants, "Size") && hasOption(variants, "Colour"))
  ) {
    return "matrix-apparel";
  }

  if (
    ART_CATEGORY_RE.test(product.category) ||
    (hasOption(variants, "Format") && !hasOption(variants, "Colour"))
  ) {
    return "matrix-art";
  }

  return "list";
}

function sizeRank(size: string): number {
  const idx = SIZE_ORDER.indexOf(size.toUpperCase());
  return idx === -1 ? SIZE_ORDER.length : idx;
}

function sortColumns(values: string[]): string[] {
  const unique = Array.from(new Set(values));
  const sizes = unique.filter((v) => SIZE_ORDER.includes(v.toUpperCase()));
  const rest = unique.filter((v) => !SIZE_ORDER.includes(v.toUpperCase()));
  sizes.sort((a, b) => sizeRank(a) - sizeRank(b));
  rest.sort((a, b) => a.localeCompare(b));
  return [...sizes, ...rest];
}

function cellFor(cells: VariantStockCell[], variantId: string): VariantStockCell | null {
  return cells.find((c) => c.variantId === variantId) ?? null;
}

export interface ApparelMatrixRow {
  rowKey: string;
  rowLabel: string;
  columns: string[];
  cells: Record<string, VariantStockCell | null>;
}

/** rows = Colour (or Design+Colour when present); columns = Size, sorted XS…XXL then alpha. */
export function buildApparelMatrix(
  product: Pick<Product, "variants">,
  cells: VariantStockCell[],
): ApparelMatrixRow[] {
  const variants = product.variants ?? [];
  const columns = sortColumns(
    variants.map((v) => v.options?.Size).filter((s): s is string => Boolean(s)),
  );

  const rowKeys = new Map<string, { label: string; variants: ProductVariant[] }>();
  for (const v of variants) {
    const design = v.options?.Design;
    const colour = v.options?.Colour ?? "—";
    const key = design ? `${design}::${colour}` : colour;
    const label = design ? `${design} — ${colour}` : colour;
    const existing = rowKeys.get(key);
    if (existing) existing.variants.push(v);
    else rowKeys.set(key, { label, variants: [v] });
  }

  const rows: ApparelMatrixRow[] = [];
  for (const [rowKey, { label, variants: rowVariants }] of rowKeys) {
    const rowCells: Record<string, VariantStockCell | null> = {};
    for (const col of columns) {
      const variant = rowVariants.find((v) => (v.options?.Size ?? "") === col);
      rowCells[col] = variant ? cellFor(cells, variant.id) : null;
    }
    rows.push({ rowKey, rowLabel: label, columns, cells: rowCells });
  }
  return rows;
}

export interface ArtMatrixRow {
  rowKey: string;
  rowLabel: string;
  columns: string[];
  cells: Record<string, VariantStockCell | null>;
}

/** rows = Design/title; columns = Format (or Size), sorted alpha. */
export function buildArtMatrix(
  product: Pick<Product, "title" | "variants">,
  cells: VariantStockCell[],
): ArtMatrixRow[] {
  const variants = product.variants ?? [];
  const columns = sortColumns(
    variants
      .map((v) => v.options?.Format ?? v.options?.Size)
      .filter((s): s is string => Boolean(s)),
  );

  const rowKeys = new Map<string, { label: string; variants: ProductVariant[] }>();
  for (const v of variants) {
    const design = v.options?.Design ?? product.title;
    const existing = rowKeys.get(design);
    if (existing) existing.variants.push(v);
    else rowKeys.set(design, { label: design, variants: [v] });
  }

  const rows: ArtMatrixRow[] = [];
  for (const [rowKey, { label, variants: rowVariants }] of rowKeys) {
    const rowCells: Record<string, VariantStockCell | null> = {};
    for (const col of columns) {
      const variant = rowVariants.find(
        (v) => (v.options?.Format ?? v.options?.Size ?? "") === col,
      );
      rowCells[col] = variant ? cellFor(cells, variant.id) : null;
    }
    rows.push({ rowKey, rowLabel: label, columns, cells: rowCells });
  }
  return rows;
}

export interface VariantRow {
  variantId: string;
  label: string;
  sku: string;
  cell: VariantStockCell | null;
}

/** Plain variant list — labelled rows for products without a matrix presentation. */
export function listVariantRows(
  product: Pick<Product, "variants">,
  cells: VariantStockCell[],
): VariantRow[] {
  return (product.variants ?? []).map((v) => ({
    variantId: v.id,
    label: v.label,
    sku: v.sku,
    cell: cellFor(cells, v.id),
  }));
}

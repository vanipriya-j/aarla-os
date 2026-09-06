/**
 * Inventory & Replenishment — presentation resolution.
 * Decides how a product's variants render on the Inventory screen:
 * apparel/art size-colour matrices, or a plain variant list.
 */
import type { InventoryPresentation, Product, ProductVariant, VariantStockCell } from "./types";

const APPAREL_CATEGORY_RE = /t-?shirts?|apparel|tee|garment/i;
const ART_CATEGORY_RE = /framed|art/i;

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

function optionValue(
  variant: ProductVariant,
  keys: string[],
): string | undefined {
  const opts = variant.options ?? {};
  for (const key of keys) {
    const direct = opts[key]?.trim();
    if (direct) return direct;
    const found = Object.entries(opts).find(
      ([k, v]) => k.toLowerCase() === key.toLowerCase() && v?.trim(),
    );
    if (found?.[1]?.trim()) return found[1].trim();
  }
  return undefined;
}

/** Parse Shopify-style "Black / 10-11 years" when structured options are missing. */
function parseSlashLabel(label: string | undefined): { colour?: string; size?: string } {
  if (!label) return {};
  const parts = label.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return {};
  return { colour: parts[0], size: parts.slice(1).join(" / ") };
}

/** Colour / Color / Design-aware colour axis. */
export function apparelColourOf(variant: ProductVariant): string {
  const fromOpts =
    optionValue(variant, ["Colour", "Color", "color", "colour"]) ??
    optionValue(variant, ["Design"]);
  if (fromOpts) return fromOpts;
  const parsed = parseSlashLabel(variant.label);
  return parsed.colour ?? "—";
}

/** Size axis — structured Size option or trailing slash segment. */
export function apparelSizeOf(variant: ProductVariant): string | undefined {
  const fromOpts = optionValue(variant, ["Size", "size"]);
  if (fromOpts) return fromOpts;
  return parseSlashLabel(variant.label).size;
}

function hasApparelAxes(variants: ProductVariant[]): boolean {
  const hasSize = variants.some((v) => Boolean(apparelSizeOf(v)));
  const hasColour = variants.some((v) => {
    const c = apparelColourOf(v);
    return Boolean(c && c !== "—");
  });
  return hasSize && hasColour;
}

/** Resolve how a product's variants should render on the Inventory screen. */
export function resolvePresentation(
  product: Pick<Product, "category" | "variants" | "inventoryPresentation">,
): InventoryPresentation {
  const override = product.inventoryPresentation;
  if (override && override !== "auto") return override;

  const variants = product.variants ?? [];

  if (APPAREL_CATEGORY_RE.test(product.category) || hasApparelAxes(variants)) {
    // Need a usable size axis; otherwise fall back to list.
    if (variants.some((v) => Boolean(apparelSizeOf(v)))) {
      return "matrix-apparel";
    }
  }

  const hasFormat = variants.some((v) => Boolean(optionValue(v, ["Format"])));
  const hasColour = variants.some((v) =>
    Boolean(optionValue(v, ["Colour", "Color"])),
  );
  if (ART_CATEGORY_RE.test(product.category) || (hasFormat && !hasColour)) {
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

/** rows = Colour (or Design+Colour when present); columns = Size, sorted XS…XXL then alpha/numeric. */
export function buildApparelMatrix(
  product: Pick<Product, "variants">,
  cells: VariantStockCell[],
): ApparelMatrixRow[] {
  const variants = product.variants ?? [];
  const columns = sortColumns(
    variants.map((v) => apparelSizeOf(v)).filter((s): s is string => Boolean(s)),
  );
  if (!columns.length) return [];

  const rowKeys = new Map<string, { label: string; variants: ProductVariant[] }>();
  for (const v of variants) {
    if (!apparelSizeOf(v)) continue;
    const design = optionValue(v, ["Design"]);
    const colour = apparelColourOf(v);
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
      const variant = rowVariants.find((v) => apparelSizeOf(v) === col);
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
      .map((v) => optionValue(v, ["Format"]) ?? apparelSizeOf(v))
      .filter((s): s is string => Boolean(s)),
  );

  const rowKeys = new Map<string, { label: string; variants: ProductVariant[] }>();
  for (const v of variants) {
    const design = optionValue(v, ["Design"]) ?? product.title;
    const existing = rowKeys.get(design);
    if (existing) existing.variants.push(v);
    else rowKeys.set(design, { label: design, variants: [v] });
  }

  const rows: ArtMatrixRow[] = [];
  for (const [rowKey, { label, variants: rowVariants }] of rowKeys) {
    const rowCells: Record<string, VariantStockCell | null> = {};
    for (const col of columns) {
      const variant = rowVariants.find(
        (v) => (optionValue(v, ["Format"]) ?? apparelSizeOf(v) ?? "") === col,
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

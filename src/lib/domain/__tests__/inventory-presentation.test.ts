import { describe, expect, it } from "vitest";
import {
  buildApparelMatrix,
  buildArtMatrix,
  listVariantRows,
  resolvePresentation,
} from "@/lib/domain/inventory-presentation";
import { deriveVariantTotals, movementsSeed } from "@/lib/domain/ledger";
import { locations, products } from "@/lib/domain/catalog";
import type { Product } from "@/lib/domain/types";

const tee = products.find((p) => p.id === "prod-chennai-tee")!;
const art = products.find((p) => p.id === "prod-kolam-art")!;
const kolamBottle = products.find((p) => p.id === "prod-kolam-bottle")!;

describe("resolvePresentation", () => {
  it("infers matrix-apparel from category", () => {
    expect(resolvePresentation(tee)).toBe("matrix-apparel");
  });

  it("infers matrix-apparel from Size + Colour options even with a generic category", () => {
    const product: Pick<Product, "category" | "variants" | "inventoryPresentation"> = {
      category: "Merch",
      variants: [
        { id: "v1", label: "Red S", sku: "SKU-1", options: { Size: "S", Colour: "Red" } },
      ],
    };
    expect(resolvePresentation(product)).toBe("matrix-apparel");
  });

  it("infers matrix-art from category", () => {
    expect(resolvePresentation(art)).toBe("matrix-art");
  });

  it("infers matrix-art from a Format option (no Colour)", () => {
    const product: Pick<Product, "category" | "variants" | "inventoryPresentation"> = {
      category: "Wall decor",
      variants: [{ id: "v1", label: "8x10", sku: "SKU-1", options: { Format: "8x10" } }],
    };
    expect(resolvePresentation(product)).toBe("matrix-art");
  });

  it("falls back to list for products without a matrix signal", () => {
    expect(resolvePresentation(kolamBottle)).toBe("list");
  });

  it("respects an explicit non-auto override regardless of category/options", () => {
    expect(resolvePresentation({ ...kolamBottle, inventoryPresentation: "list" })).toBe("list");
    expect(resolvePresentation({ ...kolamBottle, inventoryPresentation: "matrix-art" })).toBe(
      "matrix-art",
    );
    expect(resolvePresentation({ ...tee, inventoryPresentation: "list" })).toBe("list");
  });
});

describe("buildApparelMatrix", () => {
  it("builds rows by Colour and columns by Size, sorted XS…XXL then alpha", () => {
    const cells = deriveVariantTotals(movementsSeed, tee.id, tee.variants, locations);
    const rows = buildApparelMatrix(tee, cells);

    const colours = rows.map((r) => r.rowLabel).sort();
    expect(colours).toEqual(["Indigo", "Mustard"]);

    const indigoRow = rows.find((r) => r.rowLabel === "Indigo")!;
    expect(indigoRow.columns).toEqual(["S", "M", "L"]);
    expect(indigoRow.cells.S?.studio).toBe(24);
    expect(indigoRow.cells.M?.studio).toBe(30);
    expect(indigoRow.cells.L?.studio).toBe(3);

    const mustardRow = rows.find((r) => r.rowLabel === "Mustard")!;
    expect(mustardRow.cells.L?.studio).toBe(0);
    expect(mustardRow.cells.L?.partner).toBe(6);
  });
});

describe("buildArtMatrix", () => {
  it("builds rows by design/title and columns by Format, sorted alphabetically", () => {
    const cells = deriveVariantTotals(movementsSeed, art.id, art.variants, locations);
    const rows = buildArtMatrix(art, cells);

    expect(rows).toHaveLength(1);
    expect(rows[0].rowLabel).toBe(art.title);
    // No numeric-size match in SIZE_ORDER — falls through to plain alpha sort.
    expect(rows[0].columns).toEqual(["12x16", "16x20", "8x10"]);
    expect(rows[0].cells["8x10"]?.studio).toBe(12);
    expect(rows[0].cells["12x16"]?.studio).toBe(3);
    // The 16x20 variant exists but has no movements yet — a zero cell, not a missing one.
    expect(rows[0].cells["16x20"]?.studio).toBe(0);
    expect(rows[0].cells["16x20"]?.total).toBe(0);
  });
});

describe("listVariantRows", () => {
  it("lists every variant with its cell, in variant order", () => {
    const cells = deriveVariantTotals(
      movementsSeed,
      kolamBottle.id,
      kolamBottle.variants,
      locations,
    );
    const rows = listVariantRows(kolamBottle, cells);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.variantId)).toEqual(["var-kol-cream", "var-kol-mustard"]);
    expect(rows[0].label).toBe("Warm cream on indigo");
  });
});

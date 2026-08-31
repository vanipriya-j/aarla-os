import { describe, expect, it } from "vitest";
import {
  buildStockTableRows,
  filterStockTableRows,
  paginateStockTableRows,
  sortStockTableRows,
  uniqueStockCategories,
} from "@/lib/domain/inventory-stock-table";
import { locations, products } from "@/lib/domain/catalog";
import { movementsSeed } from "@/lib/domain/ledger";
import type { ReorderRule } from "@/lib/domain/types";

describe("inventory-stock-table", () => {
  const rules: ReorderRule[] = [
    {
      id: "rr-1",
      productId: products[0]!.id,
      variantId: products[0]!.variants[0]?.id,
      minQuantity: 99999,
    },
  ];

  const rows = buildStockTableRows({
    products,
    movements: movementsSeed,
    locations,
    reorderRules: rules,
  });

  it("flattens products into one row per variant", () => {
    const expected = products.reduce((n, p) => n + p.variants.length, 0);
    expect(rows.length).toBe(expected);
    expect(rows[0]?.key).toContain(":");
  });

  it("lists unique categories sorted", () => {
    const cats = uniqueStockCategories(rows);
    expect(cats.length).toBeGreaterThan(1);
    expect([...cats].sort((a, b) => a.localeCompare(b))).toEqual(cats);
  });

  it("filters by category, query, and stock state", () => {
    const cat = rows[0]!.category;
    const byCat = filterStockTableRows(rows, { category: cat, query: "", stock: "all" });
    expect(byCat.every((r) => r.category === cat)).toBe(true);

    const q = rows[0]!.productTitle.slice(0, 4).toLowerCase();
    const byQuery = filterStockTableRows(rows, { category: "all", query: q, stock: "all" });
    expect(byQuery.length).toBeGreaterThan(0);
    expect(
      byQuery.every(
        (r) =>
          r.productTitle.toLowerCase().includes(q) ||
          r.productSku.toLowerCase().includes(q) ||
          r.variantLabel.toLowerCase().includes(q) ||
          r.variantSku.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q),
      ),
    ).toBe(true);

    const zeros = filterStockTableRows(rows, { category: "all", query: "", stock: "zero" });
    expect(zeros.every((r) => r.total === 0)).toBe(true);

    const low = filterStockTableRows(rows, { category: "all", query: "", stock: "low" });
    expect(low.every((r) => r.lowStock)).toBe(true);
  });

  it("sorts by total descending", () => {
    const sorted = sortStockTableRows(rows, "total-desc");
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1]!.total).toBeGreaterThanOrEqual(sorted[i]!.total);
    }
  });

  it("paginates and clamps the page", () => {
    const page1 = paginateStockTableRows(rows, 1, 5);
    expect(page1.pageRows).toHaveLength(Math.min(5, rows.length));
    expect(page1.page).toBe(1);

    const pastEnd = paginateStockTableRows(rows, 999, 5);
    expect(pastEnd.page).toBe(pastEnd.totalPages);
    expect(pastEnd.pageRows.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  filterActiveCatalogProducts,
  isActiveCatalogProduct,
} from "@/lib/domain/product-status";

describe("product-status", () => {
  it("keeps Active and operational labels; drops Draft/Archived", () => {
    expect(isActiveCatalogProduct({ status: "Active" })).toBe(true);
    expect(isActiveCatalogProduct({ status: "ACTIVE" })).toBe(true);
    expect(isActiveCatalogProduct({ status: "Low stock" })).toBe(true);
    expect(isActiveCatalogProduct({ status: "Allocated" })).toBe(true);
    expect(isActiveCatalogProduct({ status: "" })).toBe(true);
    expect(isActiveCatalogProduct({ status: "Draft" })).toBe(false);
    expect(isActiveCatalogProduct({ status: "DRAFT" })).toBe(false);
    expect(isActiveCatalogProduct({ status: "Archived" })).toBe(false);
  });

  it("filters a product list", () => {
    const list = filterActiveCatalogProducts([
      { status: "Active" },
      { status: "Draft" },
      { status: "Archived" },
      { status: "Low stock" },
    ]);
    expect(list.map((p) => p.status)).toEqual(["Active", "Low stock"]);
  });
});

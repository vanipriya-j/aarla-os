import { describe, expect, it } from "vitest";
import {
  canSoftReserve,
  resolveCatalogTarget,
  softAvailableStudio,
} from "@/lib/domain/channel-reservation";
import type { Product } from "@/lib/domain/types";

const products: Product[] = [
  {
    id: "prod-bottle",
    sku: "BOTTLE",
    title: "Story Bottle",
    category: "Bottles",
    world: "Muruga",
    story: "",
    variants: [
      { id: "var-black-m", label: "Black / M", sku: "BOTTLE-BLK-M" },
      { id: "var-black-l", label: "Black / L", sku: "BOTTLE-BLK-L" },
    ],
    sellingPrice: 1000,
    cost: 400,
    velocity: "Steady",
    status: "Active",
  },
  {
    id: "prod-magnet",
    sku: "MAGNET",
    title: "Fridge Magnet",
    category: "Art",
    world: "Muruga",
    story: "",
    variants: [],
    sellingPrice: 300,
    cost: 80,
    velocity: "Fast",
    status: "Active",
  },
];

describe("channel reservation domain", () => {
  it("resolves by variant SKU first", () => {
    const target = resolveCatalogTarget(products, { sku: "BOTTLE-BLK-M" });
    expect(target).toEqual({
      productId: "prod-bottle",
      variantId: "var-black-m",
      sku: "BOTTLE-BLK-M",
      title: "Story Bottle · Black / M",
    });
  });

  it("resolves by product SKU when no variant matches", () => {
    const target = resolveCatalogTarget(products, { sku: "MAGNET" });
    expect(target?.productId).toBe("prod-magnet");
    expect(target?.variantId).toBeNull();
  });

  it("resolves by productId + variantId", () => {
    const target = resolveCatalogTarget(products, {
      productId: "prod-bottle",
      variantId: "var-black-l",
    });
    expect(target?.sku).toBe("BOTTLE-BLK-L");
  });

  it("returns null when unknown", () => {
    expect(resolveCatalogTarget(products, { sku: "NOPE" })).toBeNull();
    expect(resolveCatalogTarget(products, { productId: "missing" })).toBeNull();
  });

  it("computes soft available and gate", () => {
    expect(softAvailableStudio(10, 3)).toBe(7);
    expect(softAvailableStudio(2, 5)).toBe(0);
    expect(canSoftReserve(7, 7)).toBe(true);
    expect(canSoftReserve(7, 8)).toBe(false);
    expect(canSoftReserve(1, 0)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildAvailableStockOptions,
  filterStockOptions,
  searchCatalogStockOptions,
  searchStockOptionsAtLocation,
} from "@/lib/domain/partner-stock-options";
import type { InventoryBalance, Product } from "@/lib/domain/types";

const products: Product[] = [
  {
    id: "prod-kolam-bottle",
    sku: "KOL",
    title: "Kolam Bottle",
    category: "Drinkware",
    world: "Kolam",
    story: "",
    variants: [
      { id: "var-kol-blue", label: "Blue", sku: "KOL-BLU" },
      { id: "var-kol-cream", label: "Warm cream", sku: "KOL-CRM" },
    ],
    sellingPrice: 1200,
    cost: 400,
    velocity: "Steady",
    status: "Active",
  },
  {
    id: "prod-book",
    sku: "BK",
    title: "Journey Book",
    category: "Books",
    world: "Stories",
    story: "",
    variants: [{ id: "var-book-std", label: "Standard", sku: "BK-1" }],
    sellingPrice: 500,
    cost: 100,
    velocity: "Steady",
    status: "Active",
  },
];

describe("partner-stock-options", () => {
  it("builds only positive balances at the location with variant labels", () => {
    const balances: InventoryBalance[] = [
      {
        productId: "prod-kolam-bottle",
        variantId: "var-kol-blue",
        locationId: "loc-studio",
        quantity: 4,
      },
      {
        productId: "prod-kolam-bottle",
        variantId: "var-kol-cream",
        locationId: "loc-studio",
        quantity: 0,
      },
      {
        productId: "prod-book",
        variantId: "var-book-std",
        locationId: "loc-partner-nimalli",
        quantity: 7,
      },
    ];

    const rows = buildAvailableStockOptions(products, balances, "loc-studio");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productId: "prod-kolam-bottle",
      variantId: "var-kol-blue",
      variantLabel: "Blue",
      available: 4,
    });
  });

  it("search finds variant rows without building the full catalog list", () => {
    const blue = searchCatalogStockOptions(products, "kolam blue", 25);
    expect(blue).toHaveLength(1);
    expect(blue[0]?.variantId).toBe("var-kol-blue");
    expect(searchCatalogStockOptions(products, "", 25)).toEqual([]);
  });

  it("location search surfaces catalog matches even when Studio qty is zero", () => {
    const balances: InventoryBalance[] = [
      {
        productId: "prod-kolam-bottle",
        variantId: "var-kol-blue",
        locationId: "loc-studio",
        quantity: 4,
      },
    ];
    const hits = searchStockOptionsAtLocation(products, balances, "loc-studio", "book", 25);
    expect(hits.some((h) => h.productId === "prod-book" && h.available === 0)).toBe(true);
    const kolam = searchStockOptionsAtLocation(products, balances, "loc-studio", "kolam", 25);
    expect(kolam[0]?.available).toBe(4);
    expect(kolam.some((h) => h.available === 0)).toBe(true);
  });

  it("filters available options by token query and caps results", () => {
    const options = buildAvailableStockOptions(
      products,
      [
        {
          productId: "prod-kolam-bottle",
          variantId: "var-kol-blue",
          locationId: "loc-studio",
          quantity: 2,
        },
        {
          productId: "prod-book",
          variantId: "var-book-std",
          locationId: "loc-studio",
          quantity: 3,
        },
      ],
      "loc-studio",
    );
    expect(filterStockOptions(options, "kolam blue", 25)).toHaveLength(1);
    expect(filterStockOptions(options, "", 1)).toHaveLength(1);
  });
});

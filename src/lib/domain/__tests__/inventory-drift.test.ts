import { describe, expect, it } from "vitest";
import {
  compareInventoryDrift,
  summarizeInventoryDrift,
} from "@/lib/domain/inventory-drift";

describe("inventory drift", () => {
  it("flags aarla_higher and shopify_higher", () => {
    const rows = compareInventoryDrift({
      rows: [
        {
          productId: "a",
          variantId: "a1",
          label: "A",
          sku: "A",
          shopifyVariantId: "1",
          aarlaStudio: 10,
          shopifyAvailable: 10,
        },
        {
          productId: "b",
          variantId: "b1",
          label: "B",
          sku: "B",
          shopifyVariantId: "2",
          aarlaStudio: 5,
          shopifyAvailable: 2,
        },
        {
          productId: "c",
          variantId: "c1",
          label: "C",
          sku: "C",
          shopifyVariantId: "3",
          aarlaStudio: 0,
          shopifyAvailable: 7,
        },
      ],
    });
    expect(rows.find((r) => r.productId === "a")?.status).toBe("match");
    expect(rows.find((r) => r.productId === "b")?.status).toBe("aarla_higher");
    expect(rows.find((r) => r.productId === "c")?.status).toBe("shopify_higher");
    expect(rows.find((r) => r.productId === "c")?.delta).toBe(7);
    const summary = summarizeInventoryDrift(rows);
    expect(summary.drifted).toBe(2);
    expect(summary.matched).toBe(1);
  });
});

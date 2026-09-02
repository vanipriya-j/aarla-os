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

  it("collapses many Shopify variants that map to one Aarla SKU into one row", () => {
    const rows = compareInventoryDrift({
      rows: [
        {
          productId: "prod-tee",
          variantId: "var-2xl-cream",
          label: "Marapachi - T-Shirt / 2XL / Cream",
          sku: "ARL-ADT-XS-015",
          shopifyVariantId: "s1",
          aarlaStudio: 16,
          shopifyAvailable: 1,
        },
        {
          productId: "prod-tee",
          variantId: "var-2xl-cream",
          label: "Marapachi - T-Shirt / 2XL / Cream",
          sku: "ARL-ADT-XS-015",
          shopifyVariantId: "s2",
          aarlaStudio: 16,
          shopifyAvailable: 6,
        },
        {
          productId: "prod-tee",
          variantId: "var-2xl-cream",
          label: "Marapachi - T-Shirt / 2XL / Cream",
          sku: "ARL-ADT-XS-015",
          shopifyVariantId: "s3",
          aarlaStudio: 16,
          shopifyAvailable: 2,
        },
        {
          productId: "prod-tee",
          variantId: "var-2xl-cream",
          label: "Marapachi - T-Shirt / 2XL / Cream",
          sku: "ARL-ADT-XS-015",
          shopifyVariantId: "s4",
          aarlaStudio: 16,
          shopifyAvailable: 4,
        },
        {
          productId: "prod-tee",
          variantId: "var-2xl-cream",
          label: "Marapachi - T-Shirt / 2XL / Cream",
          sku: "ARL-ADT-XS-015",
          shopifyVariantId: "s5",
          aarlaStudio: 16,
          shopifyAvailable: 3,
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shopifyAvailable).toBe(16); // 1+6+2+4+3
    expect(rows[0]?.aarlaStudio).toBe(16);
    expect(rows[0]?.status).toBe("match");
    expect(rows[0]?.shopifyLinkCount).toBe(5);
  });
});

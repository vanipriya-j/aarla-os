import { describe, expect, it } from "vitest";
import {
  draftLineKey,
  toDraftLine,
} from "@/components/partners/PartnerStockDraftLines";
import type { PartnerStockOption } from "@/lib/domain/partner-stock-options";

describe("partner draft lines", () => {
  it("builds a draft line capped to available qty", () => {
    const option: PartnerStockOption = {
      productId: "prod-kolam-bottle",
      productTitle: "Kolam Bottle",
      variantId: "var-kol-blue",
      variantLabel: "Blue",
      sku: "KOL-BLU",
      available: 3,
    };
    const line = toDraftLine(option, 9);
    expect(line.quantity).toBe(3);
    expect(draftLineKey(line)).toBe("prod-kolam-bottle::var-kol-blue");
  });
});

import { describe, expect, it } from "vitest";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";

describe("fetchVariantsInventoryByIds", () => {
  it("returns only requested fixture variants", async () => {
    const connector = new FixtureShopifyConnector();
    const rows = await connector.fetchVariantsInventoryByIds!(["9001", "9002", "missing"]);
    expect(rows.map((r) => r.externalVariantId).sort()).toEqual(["9001", "9002"]);
    expect(rows.every((r) => typeof r.available === "number")).toBe(true);
  });
});

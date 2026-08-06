import { describe, expect, it } from "vitest";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";

describe("FixtureShopifyConnector name query filtering", () => {
  it("filters orders for targeted phone backfill queries", async () => {
    const connector = new FixtureShopifyConnector();
    const page = await connector.fetchCustomerCallPage({
      query: 'name:"#10450" OR name:"#10451"',
      maxPages: 1,
    });
    expect(page.orders.map((o) => o.orderNumber).sort()).toEqual(["#10450", "#10451"]);
    expect(page.customers.some((c) => c.externalId === "1001")).toBe(true);
  });
});

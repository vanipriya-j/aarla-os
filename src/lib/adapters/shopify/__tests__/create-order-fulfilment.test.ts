import { describe, expect, it, afterEach } from "vitest";
import { FixtureShopifyConnector } from "@/lib/adapters/shopify/fixture-connector";

describe("FixtureShopifyConnector.createOrderFulfilment", () => {
  it("returns a fixture fulfilment id for an AWB", async () => {
    const c = new FixtureShopifyConnector();
    const r = await c.createOrderFulfilment({
      shopifyOrderId: "12345",
      trackingNumber: "32882210003382",
      trackingCompany: "Delhivery",
      trackingUrl: "https://www.delhivery.com/track/package/32882210003382",
    });
    expect(r.ok).toBe(true);
    expect(r.fulfilmentId).toBe("fixture-ful-32882210003382");
  });
});

describe("LiveShopifyGraphqlConnector.createOrderFulfilment", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const hadWindow = "window" in globalThis;

  afterEach(() => {
    if (hadWindow) {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it("loads open fulfillment orders then creates fulfillment with Delhivery tracking", async () => {
    // Live connector refuses browser; vitest exposes window by default.
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { window?: unknown }).window;

    const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query: string;
        variables: Record<string, unknown>;
      };
      calls.push(body);
      if (body.query.includes("OrderOpenFulfillmentOrders")) {
        return new Response(
          JSON.stringify({
            data: {
              order: {
                id: "gid://shopify/Order/99",
                displayFulfillmentStatus: "UNFULFILLED",
                fulfillmentOrders: {
                  edges: [
                    { node: { id: "gid://shopify/FulfillmentOrder/1", status: "OPEN" } },
                    { node: { id: "gid://shopify/FulfillmentOrder/2", status: "CLOSED" } },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            fulfillmentCreate: {
              fulfillment: {
                id: "gid://shopify/Fulfillment/777",
                status: "SUCCESS",
                trackingInfo: [
                  { company: "Delhivery", number: "AWB1", url: null },
                ],
              },
              userErrors: [],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { LiveShopifyGraphqlConnector } = await import(
      "@/lib/adapters/shopify/live-graphql-connector"
    );
    const c = new LiveShopifyGraphqlConnector(
      {
        storeDomain: "aarla.myshopify.com",
        apiVersion: "2025-04",
        adminApiAccessToken: "shpat_test",
      },
      fetchImpl,
    );

    const r = await c.createOrderFulfilment({
      shopifyOrderId: "99",
      trackingNumber: "AWB1",
      trackingCompany: "Delhivery",
    });

    expect(r.ok).toBe(true);
    expect(r.fulfilmentId).toBe("777");
    expect(calls).toHaveLength(2);
    const createVars = calls[1]?.variables as {
      fulfillment: {
        lineItemsByFulfillmentOrder: Array<{ fulfillmentOrderId: string }>;
        trackingInfo: { number: string; company: string };
      };
    };
    expect(createVars.fulfillment.trackingInfo.number).toBe("AWB1");
    expect(createVars.fulfillment.trackingInfo.company).toBe("Delhivery");
    expect(createVars.fulfillment.lineItemsByFulfillmentOrder).toEqual([
      { fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1" },
    ]);
  });
});

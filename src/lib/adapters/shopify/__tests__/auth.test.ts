import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearShopifyTokenCache,
  normalizeShopifyShopDomain,
  readShopifyAuthConfigFromEnv,
  resolveShopifyAccessToken,
} from "@/lib/adapters/shopify/auth";

afterEach(() => {
  clearShopifyTokenCache();
});

describe("Shopify auth (Dev Dashboard client credentials)", () => {
  it("normalizes store domains", () => {
    expect(normalizeShopifyShopDomain("aarla")).toBe("aarla.myshopify.com");
    expect(normalizeShopifyShopDomain("https://aarla.myshopify.com/")).toBe(
      "aarla.myshopify.com",
    );
  });

  it("reads client credentials from env", () => {
    const cfg = readShopifyAuthConfigFromEnv({
      SHOPIFY_STORE_DOMAIN: "aarla.myshopify.com",
      SHOPIFY_CLIENT_ID: "cid",
      SHOPIFY_CLIENT_SECRET: "csecret",
      SHOPIFY_API_VERSION: "2025-01",
    } as NodeJS.ProcessEnv);
    expect(cfg).toMatchObject({
      storeDomain: "aarla.myshopify.com",
      clientId: "cid",
      clientSecret: "csecret",
      apiVersion: "2025-01",
    });
  });

  it("prefers static admin token when present", async () => {
    const fetchImpl = vi.fn();
    const token = await resolveShopifyAccessToken(
      {
        storeDomain: "aarla.myshopify.com",
        apiVersion: "2025-01",
        adminApiAccessToken: "shpat_static",
        clientId: "cid",
        clientSecret: "csecret",
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(token).toBe("shpat_static");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("exchanges client credentials and caches the token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "tok_1",
          expires_in: 86399,
          scope: "read_orders,read_customers",
        }),
      });

    const cfg = {
      storeDomain: "aarla.myshopify.com",
      apiVersion: "2025-01",
      clientId: "cid",
      clientSecret: "csecret",
    };

    const a = await resolveShopifyAccessToken(cfg, fetchImpl as unknown as typeof fetch);
    const b = await resolveShopifyAccessToken(cfg, fetchImpl as unknown as typeof fetch);
    expect(a).toBe("tok_1");
    expect(b).toBe("tok_1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "https://aarla.myshopify.com/admin/oauth/access_token",
    );
  });

  it("surfaces token endpoint errors safely", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "shop_not_permitted",
        error_description: "Client credentials cannot be performed on this shop.",
      }),
    });

    await expect(
      resolveShopifyAccessToken(
        {
          storeDomain: "aarla.myshopify.com",
          apiVersion: "2025-01",
          clientId: "cid",
          clientSecret: "csecret",
        },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/shop_not_permitted/i);
  });
});

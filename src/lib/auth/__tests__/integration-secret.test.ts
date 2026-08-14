import { describe, expect, it } from "vitest";
import {
  assertShopifyIntegrationAuth,
  extractIntegrationSecret,
  readShopifyIntegrationSecret,
} from "@/lib/auth/integration-secret";

describe("Shopify integration secret auth", () => {
  const env = {
    SHOPIFY_INTEGRATION_SECRET: "reserve-secret-xyz",
  } as unknown as NodeJS.ProcessEnv;

  it("reads secret from env", () => {
    expect(readShopifyIntegrationSecret(env)).toBe("reserve-secret-xyz");
    expect(readShopifyIntegrationSecret({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("extracts Bearer and custom header", () => {
    expect(
      extractIntegrationSecret(
        new Request("http://localhost", {
          headers: { Authorization: "Bearer reserve-secret-xyz" },
        }),
      ),
    ).toBe("reserve-secret-xyz");
    expect(
      extractIntegrationSecret(
        new Request("http://localhost", {
          headers: { "x-aarla-integration-secret": "reserve-secret-xyz" },
        }),
      ),
    ).toBe("reserve-secret-xyz");
  });

  it("accepts valid secret and rejects invalid / missing config", () => {
    const okReq = new Request("http://localhost", {
      headers: { Authorization: "Bearer reserve-secret-xyz" },
    });
    expect(assertShopifyIntegrationAuth(okReq, env)).toEqual({ ok: true });

    const badReq = new Request("http://localhost", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(assertShopifyIntegrationAuth(badReq, env)).toEqual({
      ok: false,
      status: 401,
      error: "Invalid integration secret.",
    });

    expect(assertShopifyIntegrationAuth(okReq, {} as NodeJS.ProcessEnv).ok).toBe(false);
    expect(assertShopifyIntegrationAuth(okReq, {} as NodeJS.ProcessEnv)).toMatchObject({
      status: 503,
    });
  });
});

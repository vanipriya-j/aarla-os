/**
 * Shopify Admin API authentication helpers — SERVER ONLY.
 *
 * Supports:
 * 1) Static Admin API access token (legacy / optional override)
 * 2) Dev Dashboard client credentials grant (preferred)
 *
 * Never import from browser-bound modules.
 */

export type ShopifyAuthConfig = {
  storeDomain: string;
  apiVersion: string;
  /** Legacy/static token (`shpat_…`) if available */
  adminApiAccessToken?: string;
  /** Dev Dashboard Client ID */
  clientId?: string;
  /** Dev Dashboard Client secret */
  clientSecret?: string;
};

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

const tokenCache = new Map<string, CachedToken>();

function assertServerOnly(): void {
  // Vitest uses happy-dom (defines window). Real browser bundles must not import this module.
  if (process.env.VITEST) return;
  if (typeof window !== "undefined") {
    throw new Error("Shopify auth helpers must not run in the browser.");
  }
}

/** Normalize `store.myshopify.com` or bare `store` → hostname without protocol. */
export function normalizeShopifyShopDomain(raw: string): string {
  let domain = raw.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!domain.includes(".")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}

export function shopSubdomain(storeDomain: string): string {
  const host = normalizeShopifyShopDomain(storeDomain);
  return host.replace(/\.myshopify\.com$/i, "");
}

export function readShopifyAuthConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ShopifyAuthConfig | null {
  const storeDomainRaw =
    env.SHOPIFY_STORE_DOMAIN?.trim() ||
    env.SHOPIFY_SHOP?.trim() ||
    "";
  if (!storeDomainRaw) return null;

  const apiVersion = env.SHOPIFY_API_VERSION?.trim() || "2025-04";
  const adminApiAccessToken = env.SHOPIFY_ADMIN_API_ACCESS_TOKEN?.trim() || undefined;
  const clientId = env.SHOPIFY_CLIENT_ID?.trim() || undefined;
  const clientSecret = env.SHOPIFY_CLIENT_SECRET?.trim() || undefined;

  if (!adminApiAccessToken && !(clientId && clientSecret)) {
    return null;
  }

  return {
    storeDomain: normalizeShopifyShopDomain(storeDomainRaw),
    apiVersion,
    adminApiAccessToken,
    clientId,
    clientSecret,
  };
}

/**
 * Resolve an Admin API access token.
 * Prefers static token when set; otherwise exchanges client credentials.
 * Tokens from client credentials expire ~24h and are cached in-memory.
 */
export async function resolveShopifyAccessToken(
  config: ShopifyAuthConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  assertServerOnly();

  if (config.adminApiAccessToken) {
    return config.adminApiAccessToken;
  }

  if (!config.clientId || !config.clientSecret) {
    throw new Error(
      "Shopify credentials incomplete. Set SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET, or SHOPIFY_ADMIN_API_ACCESS_TOKEN.",
    );
  }

  const cacheKey = `${config.storeDomain}|${config.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAtMs - 60_000) {
    return cached.accessToken;
  }

  const shop = shopSubdomain(config.storeDomain);
  const res = await fetchImpl(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; error_description?: string };
      if (body.error || body.error_description) {
        detail = [body.error, body.error_description].filter(Boolean).join(": ");
      }
    } catch {
      /* ignore parse */
    }
    throw new Error(`Shopify token request failed (${detail})`);
  }

  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    throw new Error("Shopify token response missing access_token");
  }

  const expiresInSec = typeof body.expires_in === "number" ? body.expires_in : 86_399;
  tokenCache.set(cacheKey, {
    accessToken: body.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  });

  return body.access_token;
}

/** Test helper — clear in-memory token cache. */
export function clearShopifyTokenCache(): void {
  tokenCache.clear();
}

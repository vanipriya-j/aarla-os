/**
 * Shopify Admin deep links — SERVER ONLY (uses store env).
 * Prefer attaching the computed URL on Product when listing the catalog.
 */
import {
  normalizeShopifyShopDomain,
  shopSubdomain,
} from "@/lib/adapters/shopify/auth";
import { shopifyGidToExternalId } from "@/lib/adapters/shopify/normalize";

/**
 * Open a product in Shopify Admin.
 * Accepts a numeric id or `gid://shopify/Product/…`.
 * Only needs SHOPIFY_STORE_DOMAIN (no API credentials).
 */
export function shopifyAdminProductUrl(
  shopifyProductId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = shopifyProductId?.trim();
  if (!raw) return null;
  const id = shopifyGidToExternalId(raw) ?? raw;
  // Admin product pages need the numeric Shopify product id.
  if (!/^\d+$/.test(id)) return null;

  const storeDomainRaw = env.SHOPIFY_STORE_DOMAIN?.trim() || env.SHOPIFY_SHOP?.trim() || "";
  if (!storeDomainRaw) return null;

  const handle = shopSubdomain(normalizeShopifyShopDomain(storeDomainRaw));
  if (!handle) return null;

  return `https://admin.shopify.com/store/${handle}/products/${id}`;
}

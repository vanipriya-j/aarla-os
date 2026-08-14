import { timingSafeEqual } from "node:crypto";

/**
 * Shared secret for machine callers (Shopify → Aarla OS).
 * Prefer SHOPIFY_INTEGRATION_SECRET; SETUP_SECRET is not reused.
 */
export function readShopifyIntegrationSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.SHOPIFY_INTEGRATION_SECRET?.trim();
  return value || null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Accept Authorization: Bearer <secret> or x-aarla-integration-secret.
 */
export function extractIntegrationSecret(request: Request): string | null {
  const header = request.headers.get("x-aarla-integration-secret")?.trim();
  if (header) return header;
  const auth = request.headers.get("authorization")?.trim();
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1]?.trim() || null;
}

export type IntegrationAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function assertShopifyIntegrationAuth(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): IntegrationAuthResult {
  const expected = readShopifyIntegrationSecret(env);
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error:
        "SHOPIFY_INTEGRATION_SECRET is not set on the server. Add it in Vercel → Environment Variables, redeploy, then retry.",
    };
  }
  const provided = extractIntegrationSecret(request);
  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Invalid integration secret." };
  }
  return { ok: true };
}

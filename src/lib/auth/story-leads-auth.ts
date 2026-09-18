import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Machine auth for GYVFT → Your Story. Our Telling. inbound leads.
 *
 * Prefer: Authorization: Bearer <STORY_LEADS_API_KEY>
 * Also:   x-aarla-story-leads-key: <STORY_LEADS_API_KEY>
 * Or HMAC: X-Aarla-Timestamp + X-Aarla-Signature: sha256=<hex>
 *          over `${timestamp}.${rawBody}` with the same secret.
 *
 * GYVFT_LEADS_API_KEY is accepted as an alias for STORY_LEADS_API_KEY.
 */

export const STORY_LEADS_HMAC_SKEW_SECONDS = 300;

export function readStoryLeadsApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value =
    env.STORY_LEADS_API_KEY?.trim() ||
    env.GYVFT_LEADS_API_KEY?.trim() ||
    "";
  return value || null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function extractStoryLeadsBearer(request: Request): string | null {
  const custom = request.headers.get("x-aarla-story-leads-key")?.trim();
  if (custom) return custom;
  const auth = request.headers.get("authorization")?.trim();
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1]?.trim() || null;
}

export function parseStoryLeadsSignatureHeader(
  header: string | null,
): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  const match = /^sha256=([a-fA-F0-9]{64})$/.exec(trimmed);
  return match?.[1]?.toLowerCase() ?? null;
}

export function computeStoryLeadsHmacHex(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
}

export type StoryLeadsAuthResult =
  | { ok: true; method: "bearer" | "hmac" }
  | { ok: false; status: 401 | 503; code: string; error: string };

/**
 * Validate Bearer or HMAC. Pass rawBody for HMAC path (empty string if unused).
 */
export function assertStoryLeadsAuth(
  request: Request,
  rawBody: string,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now(),
): StoryLeadsAuthResult {
  const expected = readStoryLeadsApiKey(env);
  if (!expected) {
    return {
      ok: false,
      status: 503,
      code: "misconfigured",
      error:
        "STORY_LEADS_API_KEY is not set on the server. Add it in Vercel → Environment Variables, redeploy, then retry.",
    };
  }

  const bearer = extractStoryLeadsBearer(request);
  if (bearer) {
    if (!safeEqual(bearer, expected)) {
      return {
        ok: false,
        status: 401,
        code: "unauthorized",
        error: "Invalid API key.",
      };
    }
    return { ok: true, method: "bearer" };
  }

  const timestamp = request.headers.get("x-aarla-timestamp")?.trim() || "";
  const sigHex = parseStoryLeadsSignatureHeader(
    request.headers.get("x-aarla-signature"),
  );
  if (timestamp && sigHex) {
    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) {
      return {
        ok: false,
        status: 401,
        code: "unauthorized",
        error: "Invalid X-Aarla-Timestamp.",
      };
    }
    // Accept seconds or milliseconds.
    const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
    const skewMs = STORY_LEADS_HMAC_SKEW_SECONDS * 1000;
    if (Math.abs(nowMs - tsMs) > skewMs) {
      return {
        ok: false,
        status: 401,
        code: "unauthorized",
        error: `Timestamp outside ±${STORY_LEADS_HMAC_SKEW_SECONDS}s skew window.`,
      };
    }
    const expectedHex = computeStoryLeadsHmacHex(expected, timestamp, rawBody);
    if (!safeEqual(expectedHex, sigHex)) {
      return {
        ok: false,
        status: 401,
        code: "unauthorized",
        error: "Invalid HMAC signature.",
      };
    }
    return { ok: true, method: "hmac" };
  }

  return {
    ok: false,
    status: 401,
    code: "unauthorized",
    error:
      "Missing credentials. Use Authorization: Bearer <STORY_LEADS_API_KEY> or X-Aarla-Timestamp + X-Aarla-Signature.",
  };
}

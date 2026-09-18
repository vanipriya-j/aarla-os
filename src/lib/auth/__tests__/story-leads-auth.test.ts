import { describe, expect, it } from "vitest";
import {
  assertStoryLeadsAuth,
  computeStoryLeadsHmacHex,
  extractStoryLeadsBearer,
  parseStoryLeadsSignatureHeader,
  readStoryLeadsApiKey,
  STORY_LEADS_HMAC_SKEW_SECONDS,
} from "@/lib/auth/story-leads-auth";

describe("story leads auth", () => {
  const env = {
    STORY_LEADS_API_KEY: "gyvft-test-secret-abc",
  } as unknown as NodeJS.ProcessEnv;

  it("reads STORY_LEADS_API_KEY and GYVFT alias", () => {
    expect(readStoryLeadsApiKey(env)).toBe("gyvft-test-secret-abc");
    expect(
      readStoryLeadsApiKey({
        GYVFT_LEADS_API_KEY: "alias-secret",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("alias-secret");
    expect(readStoryLeadsApiKey({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("extracts Bearer and custom header", () => {
    expect(
      extractStoryLeadsBearer(
        new Request("http://localhost", {
          headers: { Authorization: "Bearer gyvft-test-secret-abc" },
        }),
      ),
    ).toBe("gyvft-test-secret-abc");
    expect(
      extractStoryLeadsBearer(
        new Request("http://localhost", {
          headers: { "x-aarla-story-leads-key": "gyvft-test-secret-abc" },
        }),
      ),
    ).toBe("gyvft-test-secret-abc");
  });

  it("accepts valid Bearer and rejects bad / missing config", () => {
    const okReq = new Request("http://localhost", {
      headers: { Authorization: "Bearer gyvft-test-secret-abc" },
    });
    expect(assertStoryLeadsAuth(okReq, "", env)).toEqual({
      ok: true,
      method: "bearer",
    });

    const bad = new Request("http://localhost", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(assertStoryLeadsAuth(bad, "", env)).toMatchObject({
      ok: false,
      status: 401,
      code: "unauthorized",
    });

    expect(assertStoryLeadsAuth(okReq, "", {} as NodeJS.ProcessEnv)).toMatchObject({
      ok: false,
      status: 503,
      code: "misconfigured",
    });
  });

  it("accepts valid HMAC within skew and rejects stale / bad sig", () => {
    const rawBody = JSON.stringify({ idempotency_key: "k1" });
    const nowSec = Math.floor(Date.now() / 1000);
    const timestamp = String(nowSec);
    const hex = computeStoryLeadsHmacHex("gyvft-test-secret-abc", timestamp, rawBody);
    expect(parseStoryLeadsSignatureHeader(`sha256=${hex}`)).toBe(hex);

    const okReq = new Request("http://localhost", {
      headers: {
        "X-Aarla-Timestamp": timestamp,
        "X-Aarla-Signature": `sha256=${hex}`,
      },
    });
    expect(assertStoryLeadsAuth(okReq, rawBody, env, nowSec * 1000)).toEqual({
      ok: true,
      method: "hmac",
    });

    const staleTs = String(nowSec - STORY_LEADS_HMAC_SKEW_SECONDS - 10);
    const staleHex = computeStoryLeadsHmacHex(
      "gyvft-test-secret-abc",
      staleTs,
      rawBody,
    );
    const staleReq = new Request("http://localhost", {
      headers: {
        "X-Aarla-Timestamp": staleTs,
        "X-Aarla-Signature": `sha256=${staleHex}`,
      },
    });
    expect(
      assertStoryLeadsAuth(staleReq, rawBody, env, nowSec * 1000),
    ).toMatchObject({ ok: false, status: 401 });

    const badSig = new Request("http://localhost", {
      headers: {
        "X-Aarla-Timestamp": timestamp,
        "X-Aarla-Signature": `sha256=${"ab".repeat(32)}`,
      },
    });
    expect(assertStoryLeadsAuth(badSig, rawBody, env, nowSec * 1000)).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { defaultPoolMax, normalizeDatabaseUrlForRuntime } from "../env";

const PREV = {
  VERCEL: process.env.VERCEL,
  DATABASE_POOL_MODE: process.env.DATABASE_POOL_MODE,
  DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
};

afterEach(() => {
  for (const [k, v] of Object.entries(PREV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("normalizeDatabaseUrlForRuntime", () => {
  it("rewrites session pooler to transaction port on Vercel", () => {
    process.env.VERCEL = "1";
    delete process.env.DATABASE_POOL_MODE;
    const out = normalizeDatabaseUrlForRuntime(
      "postgresql://postgres.abc:pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
    );
    expect(out).toContain(":6543/");
    expect(out).toContain("pooler.supabase.com");
  });

  it("keeps session port when DATABASE_POOL_MODE=session", () => {
    process.env.VERCEL = "1";
    process.env.DATABASE_POOL_MODE = "session";
    const url =
      "postgresql://postgres.abc:pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
    expect(normalizeDatabaseUrlForRuntime(url)).toContain(":5432/");
  });

  it("defaults pool max to 1 on Vercel", () => {
    process.env.VERCEL = "1";
    delete process.env.DATABASE_POOL_MAX;
    expect(defaultPoolMax()).toBe(1);
  });
});

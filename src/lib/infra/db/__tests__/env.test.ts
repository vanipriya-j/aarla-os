import { afterEach, describe, expect, it } from "vitest";
import { isRemoteSupabaseUrl, shouldUseSsl } from "../env";

const PREV = {
  DATABASE_SSL: process.env.DATABASE_SSL,
  VERCEL: process.env.VERCEL,
};

afterEach(() => {
  if (PREV.DATABASE_SSL === undefined) delete process.env.DATABASE_SSL;
  else process.env.DATABASE_SSL = PREV.DATABASE_SSL;
  if (PREV.VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = PREV.VERCEL;
});

describe("db env helpers", () => {
  it("detects Supabase hosts", () => {
    expect(
      isRemoteSupabaseUrl(
        "postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres",
      ),
    ).toBe(true);
    expect(
      isRemoteSupabaseUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
    ).toBe(false);
  });

  it("enables SSL for Supabase Cloud, not for local Docker", () => {
    delete process.env.DATABASE_SSL;
    delete process.env.VERCEL;
    expect(
      shouldUseSsl("postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres"),
    ).toBe(true);
    expect(
      shouldUseSsl("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
    ).toBe(false);
  });

  it("never forces SSL on localhost even when VERCEL=1", () => {
    process.env.VERCEL = "1";
    expect(
      shouldUseSsl("postgresql://postgres:postgres@localhost:54322/postgres"),
    ).toBe(false);
  });
});

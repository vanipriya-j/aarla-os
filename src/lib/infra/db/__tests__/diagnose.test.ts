import { describe, expect, it } from "vitest";
import { diagnoseDatabaseUrl } from "../diagnose";

describe("diagnoseDatabaseUrl", () => {
  it("flags https API URLs", () => {
    const d = diagnoseDatabaseUrl("https://abcdefgh.supabase.co");
    expect(d.kind).toBe("https_api");
    expect(d.okForVercel).toBe(false);
  });

  it("flags direct db hosts", () => {
    const d = diagnoseDatabaseUrl(
      "postgresql://postgres:pass@db.abcdefgh.supabase.co:5432/postgres",
    );
    expect(d.kind).toBe("direct");
    expect(d.okForVercel).toBe(false);
  });

  it("accepts session pooler", () => {
    const d = diagnoseDatabaseUrl(
      "postgresql://postgres.abcdefgh:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
    );
    expect(d.kind).toBe("session_pooler");
    expect(d.okForVercel).toBe(true);
    expect(d.host).toContain("pooler.supabase.com");
  });
});

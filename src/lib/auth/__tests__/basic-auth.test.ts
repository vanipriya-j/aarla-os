import { describe, expect, it } from "vitest";
import {
  authenticateCredentials,
  isAuthEnabled,
  readAuthCredentialsFromEnv,
} from "@/lib/auth/credentials";
import { parseBasicAuthorization } from "@/lib/auth/basic-auth";
import {
  canAccessPath,
  homePathForRole,
  isPublicPath,
} from "@/lib/auth/roles";
import { navForRole } from "@/lib/auth/nav";
import {
  generateSessionToken,
  hashSessionToken,
  sessionTtlDays,
} from "@/lib/auth/sessions-crypto";

function basic(user: string, pass: string): string {
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

describe("role-based credentials + cookie sessions", () => {
  const env = {
    AUTH_ADMIN_USERNAME: "admin",
    AUTH_ADMIN_PASSWORD: "admin-secret",
    AUTH_CRM_USERNAME: "crm",
    AUTH_CRM_PASSWORD: "crm-secret",
  } as unknown as NodeJS.ProcessEnv;

  it("parses Basic credentials (legacy helper)", () => {
    expect(parseBasicAuthorization(basic("a", "b:c"))).toEqual({
      username: "a",
      password: "b:c",
    });
    expect(parseBasicAuthorization("Bearer x")).toBeNull();
  });

  it("authenticates admin and crm users", () => {
    expect(isAuthEnabled(env)).toBe(true);
    expect(
      authenticateCredentials("admin", "admin-secret", env)?.role,
    ).toBe("admin");
    expect(authenticateCredentials("crm", "crm-secret", env)?.role).toBe("crm");
    expect(authenticateCredentials("crm", "wrong", env)).toBeNull();
  });

  it("reads configured usernames from env", () => {
    const users = readAuthCredentialsFromEnv(env);
    expect(users.map((u) => u.role).sort()).toEqual(["admin", "crm"]);
  });

  it("allows crm only on outreach call paths", () => {
    expect(canAccessPath("crm", "/customer-calls")).toBe(true);
    expect(canAccessPath("crm", "/api/commerce/sync/shopify")).toBe(true);
    expect(canAccessPath("crm", "/diagnostics")).toBe(false);
    expect(canAccessPath("crm", "/")).toBe(false);
    // /setup is public (secret-gated API) so bootstrap works before login
    expect(canAccessPath("crm", "/setup")).toBe(true);
    expect(canAccessPath("admin", "/setup")).toBe(true);
    expect(homePathForRole("crm")).toBe("/customer-calls");
    expect(isPublicPath("/api/health")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/api/auth/logout")).toBe(true);
    expect(isPublicPath("/setup")).toBe(true);
    expect(isPublicPath("/api/setup")).toBe(true);
    expect(isPublicPath("/api/integrations/shopify/reservations")).toBe(true);
  });

  it("filters nav for crm to Customer Calls only", () => {
    const crm = navForRole("crm");
    expect(crm.showHome).toBe(false);
    expect(crm.workflows).toHaveLength(0);
    expect(crm.network).toHaveLength(0);
    expect(crm.outreach.map((i) => i.href)).toEqual(["/customer-calls"]);

    const admin = navForRole("admin");
    expect(admin.showHome).toBe(true);
    expect(admin.outreach.some((i) => i.href === "/diagnostics")).toBe(true);
  });

  it("disables auth when no passwords are set", () => {
    expect(isAuthEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("hashes session tokens stably and uniquely", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(hashSessionToken(a)).toBe(hashSessionToken(a));
    expect(hashSessionToken(a)).not.toBe(hashSessionToken(b));
    expect(sessionTtlDays({} as unknown as NodeJS.ProcessEnv)).toBe(14);
    expect(
      sessionTtlDays({
        AUTH_SESSION_TTL_DAYS: "7",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(7);
  });
});

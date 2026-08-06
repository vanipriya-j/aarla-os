import { describe, expect, it } from "vitest";
import {
  authenticateBasic,
  isAuthEnabled,
  parseBasicAuthorization,
  readAuthCredentialsFromEnv,
} from "@/lib/auth/basic-auth";
import { canAccessPath, homePathForRole, isPublicPath } from "@/lib/auth/roles";
import { navForRole } from "@/lib/auth/nav";

function basic(user: string, pass: string): string {
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

describe("role-based basic auth", () => {
  const env = {
    AUTH_ADMIN_USERNAME: "admin",
    AUTH_ADMIN_PASSWORD: "admin-secret",
    AUTH_CRM_USERNAME: "crm",
    AUTH_CRM_PASSWORD: "crm-secret",
  } as NodeJS.ProcessEnv;

  it("parses Basic credentials", () => {
    expect(parseBasicAuthorization(basic("a", "b:c"))).toEqual({
      username: "a",
      password: "b:c",
    });
    expect(parseBasicAuthorization("Bearer x")).toBeNull();
  });

  it("authenticates admin and crm users", () => {
    expect(isAuthEnabled(env)).toBe(true);
    expect(authenticateBasic(basic("admin", "admin-secret"), env)?.role).toBe(
      "admin",
    );
    expect(authenticateBasic(basic("crm", "crm-secret"), env)?.role).toBe("crm");
    expect(authenticateBasic(basic("crm", "wrong"), env)).toBeNull();
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
    expect(canAccessPath("crm", "/setup")).toBe(false);
    expect(canAccessPath("admin", "/setup")).toBe(true);
    expect(homePathForRole("crm")).toBe("/customer-calls");
    expect(isPublicPath("/api/health")).toBe(true);
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
});

/**
 * Role-based access for Aarla OS (cookie sessions).
 *
 * - admin: full founder OS (env credentials)
 * - crm: Customer Calls outreach only
 * - team: internal team accounts (username + PIN), path-gated by access roles
 */

import type { AccessRoleCode } from "@/lib/domain/team-types";
import { homePathForTeam, teamCanAccessPath } from "@/lib/auth/team-access";

export type AppRole = "admin" | "crm" | "team";

export const AUTH_ROLE_HEADER = "x-aarla-role";
export const AUTH_USER_HEADER = "x-aarla-user";
export const AUTH_SESSION_HEADER = "x-aarla-session-id";
export const AUTH_ACCOUNT_HEADER = "x-aarla-account-id";
export const AUTH_PERSON_HEADER = "x-aarla-person-id";
export const AUTH_ACCESS_ROLES_HEADER = "x-aarla-access-roles";

/** Paths CRM may open (prefix match). */
const CRM_PATH_PREFIXES = [
  "/customer-calls",
  "/api/commerce/sync",
] as const;

/**
 * Always public (no login), even when auth is enabled.
 */
const PUBLIC_PATH_PREFIXES = [
  "/api/health",
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/setup",
  "/api/setup",
  "/api/integrations/shopify/reservations",
  "/api/integrations/shopify/commerce-events",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|webmanifest)$/i.test(pathname)
  );
}

export function crmHomePath(): string {
  return "/customer-calls";
}

export function parseAccessRoleCodes(raw: string | null | undefined): AccessRoleCode[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as AccessRoleCode[];
}

export function canAccessPath(
  role: AppRole,
  pathname: string,
  accessRoleCodes: AccessRoleCode[] = [],
): boolean {
  if (role === "admin") return true;
  if (isPublicPath(pathname) || isStaticAssetPath(pathname)) return true;
  if (role === "crm") {
    return CRM_PATH_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
  }
  if (role === "team") {
    return teamCanAccessPath(accessRoleCodes, pathname);
  }
  return false;
}

/** Default landing after login / forbidden redirect. */
export function homePathForRole(
  role: AppRole,
  accessRoleCodes: AccessRoleCode[] = [],
): string {
  if (role === "crm") return crmHomePath();
  if (role === "team") return homePathForTeam(accessRoleCodes);
  return "/";
}

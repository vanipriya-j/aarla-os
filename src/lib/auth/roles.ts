/**
 * Role-based access for Aarla OS (HTTP Basic Auth).
 *
 * - admin: full founder OS
 * - crm: Customer Calls outreach only (+ commerce sync APIs it needs)
 */

export type AppRole = "admin" | "crm";

export const AUTH_ROLE_HEADER = "x-aarla-role";
export const AUTH_USER_HEADER = "x-aarla-user";

/** Paths CRM may open (prefix match). */
const CRM_PATH_PREFIXES = [
  "/customer-calls",
  "/api/commerce/sync",
] as const;

/** Always public (no Basic Auth), even when auth is enabled. */
const PUBLIC_PATH_PREFIXES = ["/api/health"] as const;

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

export function canAccessPath(role: AppRole, pathname: string): boolean {
  if (role === "admin") return true;
  if (isPublicPath(pathname) || isStaticAssetPath(pathname)) return true;
  return CRM_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Default landing after login / forbidden redirect. */
export function homePathForRole(role: AppRole): string {
  return role === "crm" ? crmHomePath() : "/";
}

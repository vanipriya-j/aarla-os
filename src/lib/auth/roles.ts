/**
 * Role-based access for Aarla OS (cookie sessions).
 *
 * - admin: full founder OS
 * - crm: Customer Calls outreach only (+ commerce sync APIs it needs)
 */

export type AppRole = "admin" | "crm";

export const AUTH_ROLE_HEADER = "x-aarla-role";
export const AUTH_USER_HEADER = "x-aarla-user";
export const AUTH_SESSION_HEADER = "x-aarla-session-id";

/** Paths CRM may open (prefix match). */
const CRM_PATH_PREFIXES = [
  "/customer-calls",
  "/api/commerce/sync",
] as const;

/**
 * Always public (no login), even when auth is enabled.
 * /setup + /api/setup stay open so first-time migration can create auth_sessions
 * before anyone can log in; /api/setup is still gated by SETUP_SECRET.
 */
const PUBLIC_PATH_PREFIXES = [
  "/api/health",
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/setup",
  "/api/setup",
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

/**
 * Path / nav rules for internal team accounts based on access role.
 * Env admin/crm unchanged.
 */
import type { AccessRoleCode } from "@/lib/domain/team-types";

/** Paths a team member may open, keyed by access role (union if multiple). */
const ROLE_PATH_PREFIXES: Record<AccessRoleCode, readonly string[]> = {
  FOUNDER_ADMIN: ["/"], // sentinel — full access handled separately
  OPERATIONS: [
    "/",
    "/weekly",
    "/fulfil",
    "/customer-calls",
    "/inventory",
    "/manufacture",
    "/receive",
    "/campaigns",
    "/attendance",
    "/account",
    "/api/commerce/sync",
    "/api/attendance",
  ],
  CREATIVE: [
    "/",
    "/advice",
    "/explore",
    "/story",
    "/content",
    "/projects",
    "/launch",
    "/inventory",
    "/attendance",
    "/account",
  ],
  ADMIN: [
    "/",
    "/team",
    "/people",
    "/partners",
    "/fulfil",
    "/customer-calls",
    "/inventory",
    "/attendance",
    "/account",
    "/api/attendance",
  ],
  COLLABORATOR: [
    "/",
    "/content",
    "/explore",
    "/advice",
    "/attendance",
    "/account",
  ],
};

export function teamCanAccessPath(
  accessRoleCodes: AccessRoleCode[],
  pathname: string,
): boolean {
  if (accessRoleCodes.includes("FOUNDER_ADMIN")) return true;
  const prefixes = new Set<string>();
  for (const code of accessRoleCodes) {
    for (const p of ROLE_PATH_PREFIXES[code] ?? []) prefixes.add(p);
  }
  // Always allow self attendance + account + logout APIs
  prefixes.add("/attendance");
  prefixes.add("/account");
  prefixes.add("/api/auth/logout");
  prefixes.add("/api/auth/sessions");

  for (const p of prefixes) {
    if (p === "/") {
      if (pathname === "/") return true;
      continue;
    }
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

export function homePathForTeam(accessRoleCodes: AccessRoleCode[]): string {
  if (accessRoleCodes.includes("CREATIVE") && !accessRoleCodes.includes("OPERATIONS")) {
    return "/content";
  }
  return "/";
}

export function primaryAccessRole(
  codes: AccessRoleCode[],
): AccessRoleCode | null {
  const order: AccessRoleCode[] = [
    "FOUNDER_ADMIN",
    "ADMIN",
    "OPERATIONS",
    "CREATIVE",
    "COLLABORATOR",
  ];
  for (const c of order) {
    if (codes.includes(c)) return c;
  }
  return codes[0] ?? null;
}

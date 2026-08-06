import { NextResponse } from "next/server";
import type { AppRole } from "@/lib/auth/roles";

export type AuthUser = {
  username: string;
  role: AppRole;
};

export type AuthCredentials = {
  username: string;
  password: string;
  role: AppRole;
};

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  const len = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    mismatch |= x ^ y;
  }
  return mismatch === 0;
}

/**
 * Read configured Basic Auth users from env.
 * Auth is enabled when at least one role has a non-empty password.
 */
export function readAuthCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AuthCredentials[] {
  const users: AuthCredentials[] = [];

  const adminUser = env.AUTH_ADMIN_USERNAME?.trim() || "admin";
  const adminPass = env.AUTH_ADMIN_PASSWORD?.trim() ?? "";
  if (adminPass) {
    users.push({ username: adminUser, password: adminPass, role: "admin" });
  }

  const crmUser = env.AUTH_CRM_USERNAME?.trim() || "crm";
  const crmPass = env.AUTH_CRM_PASSWORD?.trim() ?? "";
  if (crmPass) {
    users.push({ username: crmUser, password: crmPass, role: "crm" });
  }

  return users;
}

export function isAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readAuthCredentialsFromEnv(env).length > 0;
}

export function parseBasicAuthorization(
  header: string | null | undefined,
): { username: string; password: string } | null {
  if (!header) return null;
  const match = /^\s*Basic\s+(\S+)\s*$/i.exec(header);
  if (!match?.[1]) return null;
  try {
    const decoded = atob(match[1]);
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    return {
      username: decoded.slice(0, colon),
      password: decoded.slice(colon + 1),
    };
  } catch {
    return null;
  }
}

export function authenticateBasic(
  authorizationHeader: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): AuthUser | null {
  const users = readAuthCredentialsFromEnv(env);
  if (!users.length) return null;

  const parsed = parseBasicAuthorization(authorizationHeader);
  if (!parsed) return null;

  for (const user of users) {
    if (
      timingSafeEqual(parsed.username, user.username) &&
      timingSafeEqual(parsed.password, user.password)
    ) {
      return { username: user.username, role: user.role };
    }
  }
  return null;
}

export function unauthorizedBasicResponse(realm = "Aarla OS"): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

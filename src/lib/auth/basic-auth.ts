/**
 * Legacy Basic Auth helpers + shared credential re-exports.
 * Browser auth is cookie sessions; passwords are still validated at /login.
 */
export {
  authenticateCredentials,
  isAuthEnabled,
  readAuthCredentialsFromEnv,
  type AuthCredentials,
  type AuthUser,
} from "@/lib/auth/credentials";

import {
  authenticateCredentials,
  type AuthUser,
} from "@/lib/auth/credentials";

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

/** Authenticate an Authorization: Basic header against env credentials. */
export function authenticateBasic(
  authorizationHeader: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): AuthUser | null {
  const parsed = parseBasicAuthorization(authorizationHeader);
  if (!parsed) return null;
  return authenticateCredentials(parsed.username, parsed.password, env);
}

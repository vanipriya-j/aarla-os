import { headers } from "next/headers";
import {
  AUTH_ACCESS_ROLES_HEADER,
  AUTH_ACCOUNT_HEADER,
  AUTH_PERSON_HEADER,
  AUTH_ROLE_HEADER,
  AUTH_SESSION_HEADER,
  AUTH_USER_HEADER,
  parseAccessRoleCodes,
  type AppRole,
} from "@/lib/auth/roles";
import { isAuthEnabled } from "@/lib/auth/credentials";
import type { AccessRoleCode } from "@/lib/domain/team-types";

export async function getRequestAuth(): Promise<{
  role: AppRole;
  username: string;
  sessionId: string | null;
  accountId: string | null;
  personId: string | null;
  accessRoleCodes: AccessRoleCode[];
  authEnabled: boolean;
}> {
  const authEnabled = isAuthEnabled();
  const h = await headers();
  const roleHeader = h.get(AUTH_ROLE_HEADER);
  const role: AppRole =
    roleHeader === "crm" ? "crm" : roleHeader === "team" ? "team" : "admin";
  const username = h.get(AUTH_USER_HEADER) || (authEnabled ? "unknown" : "local");
  const sessionId = h.get(AUTH_SESSION_HEADER);
  const accountId = h.get(AUTH_ACCOUNT_HEADER);
  const personId = h.get(AUTH_PERSON_HEADER);
  const accessRoleCodes = parseAccessRoleCodes(h.get(AUTH_ACCESS_ROLES_HEADER));
  return {
    role,
    username,
    sessionId,
    accountId,
    personId,
    accessRoleCodes,
    authEnabled,
  };
}

import { headers } from "next/headers";
import {
  AUTH_ROLE_HEADER,
  AUTH_SESSION_HEADER,
  AUTH_USER_HEADER,
  type AppRole,
} from "@/lib/auth/roles";
import { isAuthEnabled } from "@/lib/auth/credentials";

export async function getRequestAuth(): Promise<{
  role: AppRole;
  username: string;
  sessionId: string | null;
  authEnabled: boolean;
}> {
  const authEnabled = isAuthEnabled();
  const h = await headers();
  const roleHeader = h.get(AUTH_ROLE_HEADER);
  const role: AppRole = roleHeader === "crm" ? "crm" : "admin";
  const username = h.get(AUTH_USER_HEADER) || (authEnabled ? "unknown" : "local");
  const sessionId = h.get(AUTH_SESSION_HEADER);
  return { role, username, sessionId, authEnabled };
}

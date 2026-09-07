import type { AppRole } from "@/lib/auth/roles";
import type { AccessRoleCode } from "@/lib/domain/team-types";

export type AuthSession = {
  id: string;
  username: string;
  role: AppRole;
  accountId: string | null;
  personId: string | null;
  accessRoleCodes: AccessRoleCode[];
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

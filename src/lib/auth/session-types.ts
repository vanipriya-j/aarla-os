import type { AppRole } from "@/lib/auth/roles";

export type AuthSession = {
  id: string;
  username: string;
  role: AppRole;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

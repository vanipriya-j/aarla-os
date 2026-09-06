"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AppRole } from "@/lib/auth/roles";
import type { AccessRoleCode } from "@/lib/domain/team-types";

type AuthContextValue = {
  role: AppRole;
  username: string;
  sessionId: string | null;
  accountId: string | null;
  personId: string | null;
  accessRoleCodes: AccessRoleCode[];
  authEnabled: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  role: "admin",
  username: "local",
  sessionId: null,
  accountId: null,
  personId: null,
  accessRoleCodes: [],
  authEnabled: false,
});

export function AuthProvider({
  role,
  username,
  sessionId,
  accountId,
  personId,
  accessRoleCodes,
  authEnabled,
  children,
}: AuthContextValue & { children: ReactNode }) {
  return (
    <AuthContext.Provider
      value={{
        role,
        username,
        sessionId,
        accountId,
        personId,
        accessRoleCodes,
        authEnabled,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

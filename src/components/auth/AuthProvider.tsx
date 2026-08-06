"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AppRole } from "@/lib/auth/roles";

type AuthContextValue = {
  role: AppRole;
  username: string;
  sessionId: string | null;
  authEnabled: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  role: "admin",
  username: "local",
  sessionId: null,
  authEnabled: false,
});

export function AuthProvider({
  role,
  username,
  sessionId,
  authEnabled,
  children,
}: AuthContextValue & { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ role, username, sessionId, authEnabled }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

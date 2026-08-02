"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { releaseCommerceSyncLockAction } from "@/app/actions/commerce-sync-lock-actions";

export type CommerceSyncChannel = "shopify" | "delhivery" | "all";

type CommerceSyncContextValue = {
  /** Channel currently syncing, or null when idle */
  activeSync: CommerceSyncChannel | null;
  /** True while any commerce sync is running */
  busy: boolean;
  /** Begin a sync session. Returns a lock token, or null if already busy. */
  beginSync: (channel: CommerceSyncChannel) => string | null;
  /** End the sync session and release the server lock. */
  endSync: (lockToken: string | null) => Promise<void>;
};

const CommerceSyncContext = createContext<CommerceSyncContextValue | null>(null);

function newLockToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CommerceSyncProvider({ children }: { children: ReactNode }) {
  const [activeSync, setActiveSync] = useState<CommerceSyncChannel | null>(null);
  const activeRef = useRef<CommerceSyncChannel | null>(null);

  const beginSync = useCallback((channel: CommerceSyncChannel) => {
    if (activeRef.current) return null;
    const token = newLockToken();
    activeRef.current = channel;
    setActiveSync(channel);
    return token;
  }, []);

  const endSync = useCallback(async (lockToken: string | null) => {
    try {
      if (lockToken) {
        await releaseCommerceSyncLockAction(lockToken);
      }
    } finally {
      activeRef.current = null;
      setActiveSync(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      activeSync,
      busy: activeSync !== null,
      beginSync,
      endSync,
    }),
    [activeSync, beginSync, endSync],
  );

  return (
    <CommerceSyncContext.Provider value={value}>{children}</CommerceSyncContext.Provider>
  );
}

export function useCommerceSync(): CommerceSyncContextValue {
  const ctx = useContext(CommerceSyncContext);
  if (!ctx) {
    throw new Error("useCommerceSync must be used within CommerceSyncProvider");
  }
  return ctx;
}

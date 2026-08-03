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
import { clearCommerceSyncLockViaApi } from "@/lib/client/commerce-sync-api";

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
        // Prefer release-by-token via lock API; clear is safe if release fails mid-timeout.
        await fetch("/api/commerce/sync/lock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "release", lockToken }),
          cache: "no-store",
        }).catch(() => clearCommerceSyncLockViaApi());
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

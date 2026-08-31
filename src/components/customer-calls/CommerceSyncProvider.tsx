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
import {
  runCommerceSyncAllJob,
  runFullShopifyResyncJob,
} from "@/lib/client/commerce-sync-jobs";

export type CommerceSyncChannel = "shopify" | "delhivery" | "all";

type CommerceSyncContextValue = {
  /** Channel currently syncing, or null when idle */
  activeSync: CommerceSyncChannel | null;
  /** True while any commerce sync is running */
  busy: boolean;
  /** Latest founder-facing status line (survives leaving Customer Calls) */
  status: string | null;
  error: string | null;
  /** Begin a sync session. Returns a lock token, or null if already busy. */
  beginSync: (channel: CommerceSyncChannel) => string | null;
  /** End the sync session and release the server lock. */
  endSync: (lockToken: string | null) => Promise<void>;
  /** App-shell Sync All — keeps running if you navigate away. */
  startSyncAll: () => Promise<void>;
  /** App-shell full Shopify re-sync — keeps running if you navigate away. */
  startFullShopifyResync: () => Promise<void>;
  setStatus: (status: string | null) => void;
  setError: (error: string | null) => void;
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
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef<CommerceSyncChannel | null>(null);
  const lockTokenRef = useRef<string | null>(null);

  const beginSync = useCallback((channel: CommerceSyncChannel) => {
    if (activeRef.current) return null;
    const token = newLockToken();
    activeRef.current = channel;
    lockTokenRef.current = token;
    setActiveSync(channel);
    return token;
  }, []);

  const endSync = useCallback(async (lockToken: string | null) => {
    try {
      if (lockToken) {
        await fetch("/api/commerce/sync/lock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "release", lockToken }),
          cache: "no-store",
        }).catch(() => clearCommerceSyncLockViaApi());
      }
    } finally {
      activeRef.current = null;
      lockTokenRef.current = null;
      setActiveSync(null);
    }
  }, []);

  const jobCallbacks = useCallback(
    () => ({
      getToken: () => lockTokenRef.current ?? "",
      setToken: (t: string) => {
        lockTokenRef.current = t;
      },
      setStatus: (s: string) => setStatus(s),
      setError: (e: string | null) => setError(e),
    }),
    [],
  );

  const startSyncAll = useCallback(async () => {
    const started = beginSync("all");
    if (!started) {
      setError("A sync is already in progress in this tab.");
      return;
    }
    try {
      await runCommerceSyncAllJob(jobCallbacks());
    } finally {
      await endSync(lockTokenRef.current);
    }
  }, [beginSync, endSync, jobCallbacks]);

  const startFullShopifyResync = useCallback(async () => {
    const started = beginSync("shopify");
    if (!started) {
      setError("A sync is already in progress in this tab.");
      return;
    }
    try {
      await runFullShopifyResyncJob(jobCallbacks());
    } finally {
      await endSync(lockTokenRef.current);
    }
  }, [beginSync, endSync, jobCallbacks]);

  const value = useMemo(
    () => ({
      activeSync,
      busy: activeSync !== null,
      status,
      error,
      beginSync,
      endSync,
      startSyncAll,
      startFullShopifyResync,
      setStatus,
      setError,
    }),
    [
      activeSync,
      status,
      error,
      beginSync,
      endSync,
      startSyncAll,
      startFullShopifyResync,
    ],
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

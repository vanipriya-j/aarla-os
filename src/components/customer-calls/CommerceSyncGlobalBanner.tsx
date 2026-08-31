"use client";

import Link from "next/link";
import { Hourglass, Loader2 } from "lucide-react";
import { useCommerceSync } from "@/components/customer-calls/CommerceSyncProvider";

/**
 * Sticky app-wide progress while Sync All / Full re-sync runs.
 * Survives leaving Customer Calls (same browser tab).
 */
export function CommerceSyncGlobalBanner() {
  const { busy, activeSync, status, error } = useCommerceSync();

  const shellJob =
    busy && (activeSync === "all" || activeSync === "shopify");
  if (!shellJob && !status && !error) return null;
  // Hide idle “last update” noise when not on a long-running shell job —
  // Customer Calls bar still shows history.
  if (!shellJob && !error) return null;

  const title =
    activeSync === "all"
      ? "Commerce sync in progress"
      : activeSync === "shopify"
        ? "Full Shopify re-sync in progress"
        : "Commerce sync";

  return (
    <div
      className="sticky top-0 z-40 border-b border-border bg-soft-beige/95 backdrop-blur-sm px-4 py-2.5"
      data-testid="commerce-sync-global-banner"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-6xl mx-auto flex items-start gap-2">
        {shellJob ? (
          <Hourglass className="h-4 w-4 mt-0.5 shrink-0 text-deep-navy animate-pulse" aria-hidden />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-deep-navy">{title}</p>
          {status ? (
            <p className="text-sm text-charcoal/70 mt-0.5" data-testid="commerce-sync-global-status">
              {status}
            </p>
          ) : shellJob ? (
            <p className="text-sm text-charcoal/55 mt-0.5">Working — please wait…</p>
          ) : null}
          {error ? (
            <p className="text-sm text-aarla-red mt-0.5" data-testid="commerce-sync-global-error">
              {error}
            </p>
          ) : null}
          {shellJob ? (
            <p className="text-xs text-charcoal/50 mt-1">
              You can leave this page — sync keeps running in this tab.{" "}
              <Link href="/customer-calls" className="underline hover:text-deep-navy">
                Back to Customer Calls
              </Link>
            </p>
          ) : null}
        </div>
        {shellJob ? (
          <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin text-deep-navy" aria-hidden />
        ) : null}
      </div>
    </div>
  );
}

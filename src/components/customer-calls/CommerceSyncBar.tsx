"use client";

import { useState } from "react";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { useCommerceSync } from "@/components/customer-calls/CommerceSyncProvider";
import { syncShopifyCustomerCallDataAction } from "@/app/actions/shopify-sync-actions";
import { syncDelhiveryShipmentsAction } from "@/app/actions/delhivery-sync-actions";
import {
  emptyShopifySyncSummary,
  mergeShopifySyncSummaries,
} from "@/lib/domain/external-commerce-types";
import {
  emptyDelhiverySyncSummary,
  mergeDelhiverySyncSummaries,
} from "@/lib/domain/shipment-types";
import { Layers } from "lucide-react";

/**
 * Serial Shopify → Delhivery sync. Does not auto-run on page load.
 */
export function CommerceSyncBar() {
  const { busy, beginSync, endSync, activeSync } = useCommerceSync();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSyncAll() {
    const token = beginSync("all");
    if (!token) {
      setError("A sync is already in progress.");
      return;
    }

    setError(null);
    setStatus("Starting Shopify sync…");

    try {
      let cursor: string | null = null;
      let shopifyTotal = emptyShopifySyncSummary();
      let guard = 0;
      const maxChunks = 80;

      while (guard < maxChunks) {
        guard += 1;
        setStatus(
          cursor
            ? `Shopify chunk ${guard} (continuing)…`
            : `Shopify chunk ${guard}…`,
        );
        const res = await syncShopifyCustomerCallDataAction(cursor, token);
        if (!res.ok) {
          setError(res.error);
          setStatus(null);
          return;
        }
        shopifyTotal = mergeShopifySyncSummaries(shopifyTotal, res.data);
        if (!res.data.hasMore) break;
        cursor = res.data.nextCursor ?? null;
        if (!cursor) break;
      }

      setStatus("Starting Delhivery sync…");
      let offset: number | null = 0;
      let delhiveryTotal = emptyDelhiverySyncSummary();
      guard = 0;

      while (guard < maxChunks) {
        guard += 1;
        setStatus(
          offset
            ? `Delhivery chunk ${guard} (offset ${offset})…`
            : `Delhivery chunk ${guard}…`,
        );
        const res = await syncDelhiveryShipmentsAction(offset, token);
        if (!res.ok) {
          setError(res.error);
          setStatus(null);
          return;
        }
        delhiveryTotal = mergeDelhiverySyncSummaries(delhiveryTotal, res.data);
        if (!res.data.hasMore) break;
        offset = res.data.nextOffset ?? null;
        if (offset == null) break;
      }

      setStatus(
        `Done — Shopify ${shopifyTotal.complete ? "complete" : "partial"}, ` +
          `Delhivery ${delhiveryTotal.complete ? "complete" : "partial"} ` +
          `(${delhiveryTotal.awbsProcessed ?? 0} AWBs).`,
      );
    } finally {
      await endSync(token);
    }
  }

  return (
    <FormSection
      title="Commerce sync"
      description="Nothing runs on page load. Sync Shopify first, then Delhivery — one at a time. If a sync is already running, another will not start."
    >
      <div className="flex flex-wrap items-center gap-3" data-testid="commerce-sync-bar">
        <button
          type="button"
          data-testid="sync-all-commerce"
          onClick={() => void handleSyncAll()}
          disabled={busy}
          className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white hover:bg-deep-navy/90 disabled:opacity-60"
        >
          <Layers className="h-4 w-4" />
          Sync All (Shopify → Delhivery)
        </button>
        {busy && activeSync === "all" ? (
          <StatusChip label="Syncing…" tone="neutral" />
        ) : null}
        {busy && activeSync !== "all" ? (
          <StatusChip label={`Busy: ${activeSync}`} tone="neutral" />
        ) : null}
        {status ? (
          <span className="text-sm text-charcoal/65" data-testid="commerce-sync-status">
            {status}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-aarla-red mt-3" data-testid="commerce-sync-error">
          {error}
        </p>
      ) : null}
    </FormSection>
  );
}

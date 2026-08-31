"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  clearCommerceSyncLockViaApi,
  syncShopifyOpeningInventoryChunkViaApi,
  syncShopifyProductsChunkViaApi,
} from "@/lib/client/commerce-sync-api";
import { PackagePlus, RefreshCw } from "lucide-react";

/**
 * Catalog sync + one-time legacy opening balances from Shopify inventory.
 * Going forward: use Receive / Transfer / Adjust on the ledger.
 */
export function ShopifyCatalogSyncButton({ onDone }: { onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCatalog = () => {
    startTransition(async () => {
      setError(null);
      setStatus("Syncing products from Shopify…");
      const lockToken = `catalog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      let cursor: string | null = null;
      let added = 0;
      let updated = 0;
      let variants = 0;
      let guard = 0;
      try {
        while (guard < 200) {
          guard += 1;
          const res = await syncShopifyProductsChunkViaApi(cursor, lockToken, "full");
          if (!res.ok) {
            setError(res.error);
            setStatus(null);
            await clearCommerceSyncLockViaApi().catch(() => undefined);
            return;
          }
          added += res.data.productsAdded;
          updated += res.data.productsUpdated;
          variants += res.data.variantsAdded + res.data.variantsUpdated;
          setStatus(
            `Products +${added} / ~${updated} updated · variants ${variants}` +
              (res.data.hasMore ? "…" : ""),
          );
          if (res.data.errors.length) {
            setError(res.data.errors.slice(0, 2).join(" · "));
          }
          if (!res.data.hasMore) break;
          cursor = res.data.nextCursor ?? null;
          if (!cursor) break;
        }
        setStatus(
          `Catalog sync complete — ${added} added, ${updated} updated. Next: import base inventory (one-time), then manage via Receive/Transfer.`,
        );
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
      } finally {
        await clearCommerceSyncLockViaApi().catch(() => undefined);
      }
    });
  };

  const runOpening = () => {
    startTransition(async () => {
      setError(null);
      setStatus("Importing legacy base inventory from Shopify…");
      const lockToken = `open-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      let cursor: string | null = null;
      let written = 0;
      let units = 0;
      let skipped = 0;
      let guard = 0;
      try {
        while (guard < 200) {
          guard += 1;
          const res = await syncShopifyOpeningInventoryChunkViaApi(cursor, lockToken);
          if (!res.ok) {
            setError(res.error);
            setStatus(null);
            await clearCommerceSyncLockViaApi().catch(() => undefined);
            return;
          }
          written += res.data.receiptsWritten;
          units += res.data.unitsPosted;
          skipped +=
            res.data.skippedAlreadyStocked +
            res.data.skippedUnmatched +
            res.data.skippedZero;
          setStatus(
            `Opening receipts ${written} · ${units} units` +
              (res.data.hasMore ? "…" : " — done"),
          );
          if (res.data.errors.length) {
            setError(res.data.errors.slice(0, 2).join(" · "));
          }
          if (!res.data.hasMore) break;
          cursor = res.data.nextCursor ?? null;
          if (!cursor) break;
        }
        setStatus(
          `Base inventory posted — ${written} opening receipts (${units} units). Skipped ${skipped}. Going forward use Receive / Transfer / Adjust; we will not keep syncing Shopify qty.`,
        );
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
      } finally {
        await clearCommerceSyncLockViaApi().catch(() => undefined);
      }
    });
  };

  return (
    <div className="space-y-2 max-w-xl">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={runCatalog}>
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          Sync products from Shopify
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={runOpening}>
          <PackagePlus className="h-4 w-4" />
          Import base inventory (one-time)
        </Button>
      </div>
      {status ? <p className="text-sm text-charcoal/65">{status}</p> : null}
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      <p className="text-xs text-charcoal/50">
        1) Catalog = titles/SKUs/variants. 2) Base inventory = one-time Shopify available qty →
        Studio opening receipts on the ledger. Needs <code className="text-deep-navy">read_products</code>{" "}
        + <code className="text-deep-navy">read_inventory</code>. After that, manage stock with
        Receive / Transfer — not Shopify sync.
      </p>
    </div>
  );
}

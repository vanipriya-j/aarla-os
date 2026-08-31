"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  clearCommerceSyncLockViaApi,
  syncShopifyProductsChunkViaApi,
} from "@/lib/client/commerce-sync-api";
import { RefreshCw } from "lucide-react";

/**
 * Pull Shopify products/variants into the Aarla catalog.
 * Does not invent stock balances or write stock_movements.
 */
export function ShopifyCatalogSyncButton({ onDone }: { onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
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
          `Catalog sync complete — ${added} added, ${updated} updated, ${variants} variants. Stock balances stay empty until you Receive or Transfer.`,
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
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={run}>
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Syncing Shopify products…" : "Sync products from Shopify"}
      </Button>
      {status ? <p className="text-sm text-charcoal/65">{status}</p> : null}
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      <p className="text-xs text-charcoal/50">
        Catalog only — titles, SKUs, variants. Does not pull Shopify inventory quantities or create
        movements. Needs <code className="text-deep-navy">read_products</code> on the Shopify app.
      </p>
    </div>
  );
}

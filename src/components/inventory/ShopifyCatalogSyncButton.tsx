"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  unlockCommerceSyncLockViaApi,
  syncShopifyOpeningInventoryChunkViaApi,
  syncShopifyProductsChunkViaApi,
} from "@/lib/client/commerce-sync-api";
import {
  newCommerceSyncLockToken,
  runChunkWithAutoRetry,
} from "@/lib/client/commerce-sync-auto-retry";
import { PackagePlus, RefreshCw } from "lucide-react";

/**
 * Catalog sync + one-time legacy opening balances from Shopify inventory.
 * Catalog sync is incremental by default (updated since last watermark).
 * Going forward: use Receive / Transfer / Adjust on the ledger.
 */
export function ShopifyCatalogSyncButton({ onDone }: { onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCatalog = (mode: "incremental" | "full") => {
    startTransition(async () => {
      setError(null);
      setStatus(
        mode === "incremental"
          ? "Syncing new/changed products from Shopify…"
          : "Full catalog resync from Shopify…",
      );
      const lockTokenRef = { current: newCommerceSyncLockToken() };
      let cursor: string | null = null;
      let added = 0;
      let updated = 0;
      let variants = 0;
      let productsRead = 0;
      let guard = 0;
      let incrementalFrom: string | null | undefined;
      try {
        while (guard < 200) {
          guard += 1;
          const res = await runChunkWithAutoRetry({
            getToken: () => lockTokenRef.current,
            setToken: (t) => {
              lockTokenRef.current = t;
            },
            onRetry: (attempt, maxAttempts) => {
              setError(null);
              setStatus(
                `Server timed out — unlocking and retrying ${attempt}/${maxAttempts} (saved rows kept)…`,
              );
            },
            attempt: (token) => syncShopifyProductsChunkViaApi(cursor, token, mode),
          });
          if (!res.ok) {
            setError(res.error);
            setStatus(
              "Stopped after automatic retries — click Sync products again to resume from the saved cursor.",
            );
            return;
          }
          if (incrementalFrom === undefined) {
            incrementalFrom = res.data.incrementalFrom ?? null;
          }
          added += res.data.productsAdded;
          updated += res.data.productsUpdated;
          variants += res.data.variantsAdded + res.data.variantsUpdated;
          productsRead += res.data.productsRead;
          const since =
            mode === "incremental" && incrementalFrom
              ? ` · since ${new Date(incrementalFrom).toLocaleString()}`
              : mode === "incremental"
                ? " · first sync (full catalog)"
                : " · full";
          setStatus(
            `Products read ${productsRead} · +${added} / ~${updated} updated · variants ${variants}${since}` +
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
          productsRead === 0 && mode === "incremental"
            ? "Catalog up to date — no product changes since last sync."
            : `Catalog sync complete — ${added} added, ${updated} updated (${productsRead} read). Next: import base inventory (one-time) if needed, then manage via Receive/Transfer.`,
        );
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
      } finally {
        // Unlock only — keep resume cursors so a later click can continue.
        await unlockCommerceSyncLockViaApi().catch(() => undefined);
      }
    });
  };

  const runOpening = () => {
    startTransition(async () => {
      setError(null);
      setStatus("Importing legacy base inventory from Shopify…");
      const lockTokenRef = { current: newCommerceSyncLockToken() };
      let cursor: string | null = null;
      let written = 0;
      let units = 0;
      let skipped = 0;
      let guard = 0;
      try {
        while (guard < 200) {
          guard += 1;
          const res = await runChunkWithAutoRetry({
            getToken: () => lockTokenRef.current,
            setToken: (t) => {
              lockTokenRef.current = t;
            },
            onRetry: (attempt, maxAttempts) => {
              setError(null);
              setStatus(
                `Server timed out — unlocking and retrying ${attempt}/${maxAttempts} (saved receipts kept)…`,
              );
            },
            attempt: (token) => syncShopifyOpeningInventoryChunkViaApi(cursor, token),
          });
          if (!res.ok) {
            setError(res.error);
            setStatus(
              "Stopped after automatic retries — click Import base inventory again to resume.",
            );
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
        await unlockCommerceSyncLockViaApi().catch(() => undefined);
      }
    });
  };

  return (
    <div className="space-y-2 max-w-xl">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => runCatalog("incremental")}
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          Sync products from Shopify
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={runOpening}>
          <PackagePlus className="h-4 w-4" />
          Import base inventory (one-time)
        </Button>
        <button
          type="button"
          disabled={pending}
          onClick={() => runCatalog("full")}
          className="text-xs text-charcoal/55 underline-offset-2 hover:text-deep-navy hover:underline disabled:opacity-40"
        >
          Full resync
        </button>
      </div>
      {status ? <p className="text-sm text-charcoal/65">{status}</p> : null}
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      <p className="text-xs text-charcoal/50">
        Catalog sync pulls <span className="text-deep-navy">new and changed</span> products only
        (titles/SKUs/variants since last sync). Use Full resync only if you need to re-walk the whole
        catalog. Base inventory is a one-time Shopify qty → Studio opening receipt — not ongoing.
        Needs <code className="text-deep-navy">read_products</code> +{" "}
        <code className="text-deep-navy">read_inventory</code>.
      </p>
    </div>
  );
}

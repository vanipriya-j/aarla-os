"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  pushShopifyAvailableRowViaApi,
  pullShopifyAvailableRowViaApi,
  refreshShopifyInventoryRowViaApi,
  syncShopifyInventoryChunkViaApi,
  unlockCommerceSyncLockViaApi,
} from "@/lib/client/commerce-sync-api";
import {
  newCommerceSyncLockToken,
  runChunkWithAutoRetry,
} from "@/lib/client/commerce-sync-auto-retry";
import type { InventoryDriftRow } from "@/lib/domain/inventory-drift";
import {
  mergeInventoryDriftPages,
  summarizeInventoryDrift,
} from "@/lib/domain/inventory-drift";
import { ArrowDownUp, Download, RefreshCw, Upload } from "lucide-react";

type Action = "compare" | "push" | "pull";

function rowKey(r: Pick<InventoryDriftRow, "productId" | "variantId">) {
  return `${r.productId}:${r.variantId}`;
}

/** Let the browser paint after each chunk (do not wrap the loop in startTransition). */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Stock mismatch board — Shopify available vs Aarla Studio.
 * Rows appear as each Shopify page is read; you can act on early rows while the scan continues.
 */
export function InventoryShopifySyncPanel({ onDone }: { onDone?: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rows, setRows] = useState<InventoryDriftRow[]>([]);
  const [rowSyncing, setRowSyncing] = useState<string | null>(null);
  const [variantsRead, setVariantsRead] = useState(0);
  const [linkedTotal, setLinkedTotal] = useState<number | null>(null);
  const [totals, setTotals] = useState({
    matched: 0,
    drifted: 0,
    aarlaHigher: 0,
    shopifyHigher: 0,
    pushed: 0,
    pulled: 0,
  });
  /** Rows cleared by Sync/Push during an in-flight scan — keep them off the live merge. */
  const dismissedKeysRef = useRef(new Set<string>());
  const scanGenerationRef = useRef(0);

  const paintCollected = (
    collected: InventoryDriftRow[],
    action: Action,
    stats: {
      matched: number;
      drifted: number;
      aarlaHigher: number;
      shopifyHigher: number;
      pushed: number;
      pulled: number;
    },
  ) => {
    const merged =
      action === "compare" || action === "pull" || action === "push"
        ? mergeInventoryDriftPages(collected)
        : collected;
    // For compare, API returns drifted-only rows — use accumulated page stats for matched.
    const mergedStats =
      action === "compare" ? stats : summarizeInventoryDrift(merged);
    const displayRows = (
      action === "compare" ? merged.filter((r) => r.status !== "match") : merged
    ).filter((r) => !dismissedKeysRef.current.has(rowKey(r)));
    setRows(displayRows);
    setTotals({
      matched: mergedStats.matched,
      drifted:
        action === "compare"
          ? displayRows.length
          : mergedStats.drifted,
      aarlaHigher: mergedStats.aarlaHigher,
      shopifyHigher: mergedStats.shopifyHigher,
      pushed: stats.pushed,
      pulled: stats.pulled,
    });
    return mergedStats;
  };

  const stopScan = () => {
    scanGenerationRef.current += 1;
    setScanning(false);
    setStatus((s) =>
      s ? `${s.replace(/Scanning…|Scanning\.\.\./, "Stopped")} (stopped)` : "Scan stopped.",
    );
  };

  const run = (action: Action) => {
    if (scanning) return;
    const generation = scanGenerationRef.current + 1;
    scanGenerationRef.current = generation;
    dismissedKeysRef.current = new Set();
    setScanning(true);
    setError(null);
    setRows([]);
    setVariantsRead(0);
    setLinkedTotal(null);
    setTotals({
      matched: 0,
      drifted: 0,
      aarlaHigher: 0,
      shopifyHigher: 0,
      pushed: 0,
      pulled: 0,
    });
    setStatus(
      action === "compare"
        ? "Comparing linked Aarla ↔ Shopify variants…"
        : action === "push"
          ? "Pushing Aarla Studio → Shopify available…"
          : "Pulling Shopify → Aarla Studio (adjustments)…",
    );

    void (async () => {
      const lockTokenRef = { current: newCommerceSyncLockToken() };
      let cursor: string | null = null;
      let guard = 0;
      let pushed = 0;
      let pulled = 0;
      let matched = 0;
      let drifted = 0;
      let aarlaHigher = 0;
      let shopifyHigher = 0;
      let readTotal = 0;
      let knownLinkedTotal: number | null = null;
      const collected: InventoryDriftRow[] = [];

      try {
        while (guard < 200) {
          if (scanGenerationRef.current !== generation) return;
          guard += 1;
          const res = await runChunkWithAutoRetry({
            getToken: () => lockTokenRef.current,
            setToken: (t) => {
              lockTokenRef.current = t;
            },
            onRetry: (attempt, maxAttempts) => {
              setStatus(`Timed out — retrying ${attempt}/${maxAttempts}…`);
            },
            attempt: (token) =>
              syncShopifyInventoryChunkViaApi(cursor, token, action, true),
          });
          if (scanGenerationRef.current !== generation) return;
          if (!res.ok) {
            setError(res.error);
            setStatus("Stopped — fix scopes/errors and try again.");
            return;
          }
          pushed += res.data.pushed;
          pulled += res.data.pulled;
          matched += res.data.matched;
          drifted += res.data.drifted;
          aarlaHigher += res.data.aarlaHigher;
          shopifyHigher += res.data.shopifyHigher;
          readTotal += res.data.variantsRead;
          collected.push(...res.data.rows);
          if (typeof res.data.linkedTotal === "number") {
            knownLinkedTotal = res.data.linkedTotal;
            setLinkedTotal(res.data.linkedTotal);
          }
          if (res.data.errors.length) {
            setError(res.data.errors.slice(0, 3).join(" · "));
          }

          paintCollected(collected, action, {
            matched,
            drifted,
            aarlaHigher,
            shopifyHigher,
            pushed,
            pulled,
          });
          setVariantsRead(readTotal);
          const ofLinked =
            knownLinkedTotal != null ? ` of ${knownLinkedTotal} linked` : "";
          setStatus(
            (res.data.hasMore
              ? `Scanning… ${readTotal}${ofLinked}`
              : `Done — ${readTotal}${ofLinked || " variants"}`) +
              ` · mismatches ${drifted} · matched ${matched}` +
              (action === "push" ? ` · pushed ${pushed}` : "") +
              (action === "pull" ? ` · pulled ${pulled}` : ""),
          );
          await yieldToPaint();

          if (!res.data.hasMore) break;
          cursor = res.data.nextCursor ?? null;
          if (cursor == null || cursor === "") break;
        }
        if (scanGenerationRef.current !== generation) return;
        paintCollected(collected, action, {
          matched,
          drifted,
          aarlaHigher,
          shopifyHigher,
          pushed,
          pulled,
        });
        setStatus(
          action === "compare"
            ? `Mismatch table ready — ${drifted} to review, ${matched} already aligned (${readTotal}${knownLinkedTotal != null ? ` of ${knownLinkedTotal} linked` : ""}).`
            : action === "push"
              ? `Push done — set ${pushed} Shopify available qty from Aarla Studio.`
              : `Pull done — adjusted ${pulled} Studio balances from Shopify.`,
        );
        if (action !== "compare") onDone?.();
      } catch (err) {
        if (scanGenerationRef.current !== generation) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
      } finally {
        if (scanGenerationRef.current === generation) setScanning(false);
        await unlockCommerceSyncLockViaApi().catch(() => undefined);
      }
    })();
  };

  const syncRow = async (r: InventoryDriftRow) => {
    const key = rowKey(r);
    setRowSyncing(key);
    setError(null);
    setStatus(`Syncing ${r.sku || r.label} from Shopify…`);
    const token = newCommerceSyncLockToken();
    try {
      const res = await refreshShopifyInventoryRowViaApi(token, {
        shopifyVariantId: r.shopifyVariantId,
        sku: r.sku,
        productId: r.productId,
        variantId: r.variantId,
      });
      if (!res.ok) {
        setError(res.error);
        setStatus("Row sync failed.");
        return;
      }
      if (res.data.errors.length) {
        setError(res.data.errors.slice(0, 2).join(" · "));
      }
      if (res.data.aligned || !res.data.row || res.data.row.status === "match") {
        dismissedKeysRef.current.add(key);
        setRows((prev) => prev.filter((x) => rowKey(x) !== key));
        setTotals((t) => ({
          ...t,
          drifted: Math.max(0, t.drifted - 1),
          matched: t.matched + 1,
        }));
        setStatus(
          `${r.sku || r.label} aligned` +
            (res.data.catalogUpdated ? " (catalog metadata updated)" : ""),
        );
      } else if (res.data.row) {
        setRows((prev) =>
          prev.map((x) => (rowKey(x) === key ? res.data.row! : x)),
        );
        setStatus(
          `${r.sku || r.label} refreshed — still mismatched (Studio ${res.data.row.aarlaStudio} vs Shopify ${res.data.row.shopifyAvailable})`,
        );
      }
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setRowSyncing(null);
      await unlockCommerceSyncLockViaApi().catch(() => undefined);
    }
  };

  const pullAvailableRow = async (r: InventoryDriftRow) => {
    const key = rowKey(r);
    setRowSyncing(key);
    setError(null);
    setStatus(
      `Pulling Shopify Available ${r.shopifyAvailable} → Studio for ${r.sku || r.label}…`,
    );
    const token = newCommerceSyncLockToken();
    try {
      const res = await pullShopifyAvailableRowViaApi(token, {
        shopifyVariantId: r.shopifyVariantId,
        sku: r.sku,
        productId: r.productId,
        variantId: r.variantId,
      });
      if (!res.ok) {
        setError(res.error);
        setStatus("Pull Available failed.");
        return;
      }
      if (res.data.errors.length) {
        setError(res.data.errors.slice(0, 2).join(" · "));
      }
      if (res.data.aligned || !res.data.row || res.data.row.status === "match") {
        dismissedKeysRef.current.add(key);
        setRows((prev) => prev.filter((x) => rowKey(x) !== key));
        setTotals((t) => ({
          ...t,
          drifted: Math.max(0, t.drifted - 1),
          shopifyHigher: Math.max(0, t.shopifyHigher - 1),
          matched: t.matched + 1,
          pulled: t.pulled + (res.data.pulled ? 1 : 0),
        }));
        setStatus(
          `${r.sku || r.label} — Studio set to Shopify Available ${r.shopifyAvailable}`,
        );
      } else if (res.data.row) {
        setRows((prev) =>
          prev.map((x) => (rowKey(x) === key ? res.data.row! : x)),
        );
        setStatus(
          res.data.pulled
            ? `${r.sku || r.label} pulled — still mismatched (Studio ${res.data.row.aarlaStudio} vs Shopify ${res.data.row.shopifyAvailable})`
            : `${r.sku || r.label} pull incomplete`,
        );
      }
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setRowSyncing(null);
      await unlockCommerceSyncLockViaApi().catch(() => undefined);
    }
  };

  const pushAvailableRow = async (r: InventoryDriftRow) => {
    const key = rowKey(r);
    setRowSyncing(key);
    setError(null);
    setStatus(`Pushing Studio ${r.aarlaStudio} → Shopify Available for ${r.sku || r.label}…`);
    const token = newCommerceSyncLockToken();
    try {
      const res = await pushShopifyAvailableRowViaApi(token, {
        productId: r.productId,
        variantId: r.variantId,
        shopifyVariantId: r.shopifyVariantId,
        sku: r.sku,
        inventoryItemId: r.inventoryItemId,
        locationId: r.locationId,
      });
      if (!res.ok) {
        setError(res.error);
        setStatus("Push Available failed.");
        return;
      }
      if (res.data.errors.length) {
        setError(res.data.errors.slice(0, 2).join(" · "));
      }
      if (res.data.aligned || !res.data.row || res.data.row.status === "match") {
        dismissedKeysRef.current.add(key);
        setRows((prev) => prev.filter((x) => rowKey(x) !== key));
        setTotals((t) => ({
          ...t,
          drifted: Math.max(0, t.drifted - 1),
          aarlaHigher: Math.max(0, t.aarlaHigher - 1),
          matched: t.matched + 1,
          pushed: t.pushed + (res.data.pushed ? 1 : 0),
        }));
        setStatus(
          `${r.sku || r.label} — Shopify Available set to Studio ${r.aarlaStudio}`,
        );
      } else if (res.data.row) {
        setRows((prev) =>
          prev.map((x) => (rowKey(x) === key ? res.data.row! : x)),
        );
        setStatus(
          res.data.pushed
            ? `${r.sku || r.label} pushed — still mismatched (Studio ${res.data.row.aarlaStudio} vs Shopify ${res.data.row.shopifyAvailable})`
            : `${r.sku || r.label} push incomplete`,
        );
      }
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setRowSyncing(null);
      await unlockCommerceSyncLockViaApi().catch(() => undefined);
    }
  };

  const mismatches = rows.filter((r) => r.status !== "match");

  return (
    <div className="space-y-4" data-testid="inventory-shopify-sync-panel">
      <div className="rounded-xl border border-border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-deep-navy flex items-center gap-2">
              <ArrowDownUp className="h-5 w-5" /> Stock mismatches
            </h2>
            <p className="text-sm text-charcoal/65 mt-1 max-w-2xl">
              Compares <strong>linked</strong> Aarla variants only (not the whole Shopify catalog).
              Rows appear as batches load — <strong>Pull Available</strong> when Shopify is truth,
              <strong> Push Available</strong> when Studio is truth, or <strong>Sync</strong> after
              an Admin fix.
            </p>
            <p className="text-xs text-charcoal/50 mt-2 max-w-2xl">
              <strong>Receive</strong> auto-pushes Shopify <em>Available</em> at Aarla Office for
              linked SKUs. Manufacture WIP stays in Aarla for now — Shopify <em>Incoming</em>{" "}
              needs scheduled changes (later). Do not use Committed for WIP.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {scanning ? (
              <Button size="sm" variant="outline" onClick={stopScan}>
                Stop
              </Button>
            ) : null}
            <Button size="sm" disabled={scanning} onClick={() => run("compare")}>
              <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning…" : "Show mismatches"}
            </Button>
          </div>
        </div>
        {status ? <p className="text-sm text-deep-navy">{status}</p> : null}
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {(totals.drifted > 0 || totals.matched > 0 || scanning) && (
          <p className="text-xs text-charcoal/55">
            {scanning
              ? `Live · ${variantsRead}${linkedTotal != null ? ` / ${linkedTotal} linked` : ""} · `
              : linkedTotal != null
                ? `${linkedTotal} linked · `
                : ""}
            Mismatches {totals.drifted} · Matched {totals.matched} · Aarla higher{" "}
            {totals.aarlaHigher} · Shopify higher {totals.shopifyHigher}
          </p>
        )}
      </div>

      {mismatches.length > 0 ? (
        <div className="rounded-xl border border-border bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-charcoal/45 border-b border-border">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Aarla Studio</th>
                <th className="px-4 py-3">Shopify available</th>
                <th className="px-4 py-3">One-time fix</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((r) => {
                const key = rowKey(r);
                const syncing = rowSyncing === key;
                const canPush =
                  r.status === "aarla_higher" && r.shopifyLinkCount <= 1;
                const canPull =
                  r.status === "shopify_higher" && r.shopifyLinkCount <= 1;
                return (
                  <tr key={key} className="border-b border-border/70">
                    <td className="px-4 py-3 font-medium text-deep-navy">{r.label}</td>
                    <td className="px-4 py-3 text-charcoal/60 font-mono text-xs">
                      {r.sku || "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.aarlaStudio}</td>
                    <td className="px-4 py-3 tabular-nums">{r.shopifyAvailable}</td>
                    <td className="px-4 py-3 text-xs text-charcoal/70">
                      {r.shopifyLinkCount > 1
                        ? `${r.shopifyLinkCount} Shopify variants share this Aarla SKU — summed available ${r.shopifyAvailable}. Fix duplicate SKUs in Shopify/catalog. `
                        : ""}
                      {r.status === "aarla_higher"
                        ? `Studio is truth — Push Available to ${r.aarlaStudio}, or set it in Shopify Admin.`
                        : `Shopify Available is ${r.shopifyAvailable}; Studio is ${r.aarlaStudio}. Pull Available to set Studio.`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {canPull ? (
                          <button
                            type="button"
                            disabled={!!rowSyncing}
                            onClick={() => void pullAvailableRow(r)}
                            data-testid="mismatch-row-pull-available"
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-deep-navy hover:bg-pale-cream disabled:opacity-50"
                            title="Set Aarla Studio = Shopify Available for this SKU"
                          >
                            <Download className={`h-3.5 w-3.5 ${syncing ? "animate-pulse" : ""}`} />
                            {syncing ? "…" : "Pull Available"}
                          </button>
                        ) : null}
                        {canPush ? (
                          <button
                            type="button"
                            disabled={!!rowSyncing}
                            onClick={() => void pushAvailableRow(r)}
                            data-testid="mismatch-row-push-available"
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-deep-navy hover:bg-pale-cream disabled:opacity-50"
                            title="Set Shopify Available = Aarla Studio for this SKU"
                          >
                            <Upload className={`h-3.5 w-3.5 ${syncing ? "animate-pulse" : ""}`} />
                            {syncing ? "…" : "Push Available"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={!!rowSyncing}
                          onClick={() => void syncRow(r)}
                          data-testid="mismatch-row-sync"
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-deep-navy hover:bg-pale-cream disabled:opacity-50"
                          title="Re-read this SKU from Shopify after you fix it in Admin"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                          {syncing ? "…" : "Sync"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-charcoal/50 border-t border-border">
            {scanning
              ? `Still comparing linked variants (${variantsRead}${linkedTotal != null ? ` / ${linkedTotal}` : ""} so far) — Push Available / Sync work on rows above.`
              : "Pull Available when Shopify is correct. Push Available when Studio is correct. Sync after fixing Admin. Aligned rows drop off this list."}
          </p>
        </div>
      ) : scanning ? (
        <p className="text-sm text-charcoal/55 rounded-xl border border-border bg-white px-4 py-6">
          Comparing linked variants…{" "}
          {variantsRead > 0
            ? `${variantsRead}${linkedTotal != null ? ` / ${linkedTotal}` : ""} checked.`
            : "first batch loading."}{" "}
          Mismatches show here as soon as any are found.
        </p>
      ) : rows.length > 0 || variantsRead > 0 ? (
        <p className="text-sm text-charcoal/55 rounded-xl border border-border bg-white px-4 py-6">
          No mismatches — Studio and Shopify available are aligned for linked variants.
        </p>
      ) : (
        <p className="text-sm text-charcoal/55">
          Click <strong>Show mismatches</strong> to compare linked catalog SKUs only — not the full
          Shopify store crawl.
        </p>
      )}

      <div className="rounded-xl border border-dashed border-border bg-white/60 p-4 space-y-2">
        <button
          type="button"
          className="text-xs text-charcoal/60 hover:text-deep-navy underline-offset-2 hover:underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide" : "Show"} optional bulk tools (Push / Pull)
        </button>
        {showAdvanced ? (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-charcoal/55 max-w-2xl">
              Prefer per-row Pull Available / Push Available or Sync. Bulk tools are for catch-up only.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={scanning} onClick={() => run("push")}>
                Push all Studio → Shopify
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={scanning}
                onClick={() => run("pull")}
              >
                Pull all Shopify → Aarla
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

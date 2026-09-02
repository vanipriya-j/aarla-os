"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  pushShopifyAvailableRowViaApi,
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
import { ArrowDownUp, RefreshCw, Upload } from "lucide-react";

type Action = "compare" | "push" | "pull";

/**
 * Stock mismatch board — Shopify available vs Aarla Studio.
 * Primary job: show where they differ; fix in Shopify Admin; Sync this row.
 */
export function InventoryShopifySyncPanel({ onDone }: { onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rows, setRows] = useState<InventoryDriftRow[]>([]);
  const [rowSyncing, setRowSyncing] = useState<string | null>(null);
  const [totals, setTotals] = useState({
    matched: 0,
    drifted: 0,
    aarlaHigher: 0,
    shopifyHigher: 0,
    pushed: 0,
    pulled: 0,
  });

  const run = (action: Action) => {
    startTransition(async () => {
      setError(null);
      setStatus(
        action === "compare"
          ? "Loading mismatch table (Shopify available vs Aarla Studio)…"
          : action === "push"
            ? "Pushing Aarla Studio → Shopify available…"
            : "Pulling Shopify → Aarla Studio (adjustments)…",
      );
      const lockTokenRef = { current: newCommerceSyncLockToken() };
      let cursor: string | null = null;
      let guard = 0;
      let matched = 0;
      let drifted = 0;
      let aarlaHigher = 0;
      let shopifyHigher = 0;
      let pushed = 0;
      let pulled = 0;
      const collected: InventoryDriftRow[] = [];

      try {
        while (guard < 200) {
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
          if (!res.ok) {
            setError(res.error);
            setStatus("Stopped — fix scopes/errors and try again.");
            return;
          }
          matched += res.data.matched;
          drifted += res.data.drifted;
          aarlaHigher += res.data.aarlaHigher;
          shopifyHigher += res.data.shopifyHigher;
          pushed += res.data.pushed;
          pulled += res.data.pulled;
          collected.push(...res.data.rows);
          if (res.data.errors.length) {
            setError(res.data.errors.slice(0, 3).join(" · "));
          }
          setStatus(
            `Read ${res.data.variantsRead} · mismatches ${drifted} · matched ${matched}` +
              (action === "push" ? ` · pushed ${pushed}` : "") +
              (action === "pull" ? ` · pulled ${pulled}` : "") +
              (res.data.hasMore ? "…" : ""),
          );
          if (!res.data.hasMore) break;
          cursor = res.data.nextCursor ?? null;
          if (!cursor) break;
        }
        const merged =
          action === "compare" || action === "pull" || action === "push"
            ? mergeInventoryDriftPages(collected)
            : collected;
        const mergedStats = summarizeInventoryDrift(merged);
        const displayRows =
          action === "compare"
            ? merged.filter((r) => r.status !== "match")
            : merged;
        setRows(displayRows);
        setTotals({
          matched: mergedStats.matched,
          drifted: mergedStats.drifted,
          aarlaHigher: mergedStats.aarlaHigher,
          shopifyHigher: mergedStats.shopifyHigher,
          pushed,
          pulled,
        });
        setStatus(
          action === "compare"
            ? `Mismatch table ready — ${mergedStats.drifted} to review, ${mergedStats.matched} already aligned.`
            : action === "push"
              ? `Push done — set ${pushed} Shopify available qty from Aarla Studio.`
              : `Pull done — adjusted ${pulled} Studio balances from Shopify.`,
        );
        if (action !== "compare") onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
      } finally {
        await unlockCommerceSyncLockViaApi().catch(() => undefined);
      }
    });
  };

  const syncRow = async (r: InventoryDriftRow) => {
    const key = `${r.productId}:${r.variantId}`;
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
        setRows((prev) => prev.filter((x) => `${x.productId}:${x.variantId}` !== key));
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
          prev.map((x) =>
            `${x.productId}:${x.variantId}` === key ? res.data.row! : x,
          ),
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

  const pushAvailableRow = async (r: InventoryDriftRow) => {
    const key = `${r.productId}:${r.variantId}`;
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
        setRows((prev) => prev.filter((x) => `${x.productId}:${x.variantId}` !== key));
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
          prev.map((x) =>
            `${x.productId}:${x.variantId}` === key ? res.data.row! : x,
          ),
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
              When Studio is truth, <strong>Push Available</strong>. When you fixed Shopify Admin,{" "}
              <strong>Sync</strong> that row.
            </p>
            <p className="text-xs text-charcoal/50 mt-2 max-w-2xl">
              <strong>Receive</strong> auto-pushes Shopify <em>Available</em> at Aarla Office for
              linked SKUs. Manufacture WIP stays in Aarla for now — Shopify <em>Incoming</em>{" "}
              needs scheduled changes (later). Do not use Committed for WIP.
            </p>
          </div>
          <Button size="sm" disabled={pending || !!rowSyncing} onClick={() => run("compare")}>
            <RefreshCw className="h-4 w-4" />
            {pending ? "Loading…" : "Show mismatches"}
          </Button>
        </div>
        {status ? <p className="text-sm text-deep-navy">{status}</p> : null}
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {(totals.drifted > 0 || totals.matched > 0) && (
          <p className="text-xs text-charcoal/55">
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
                const key = `${r.productId}:${r.variantId}`;
                const syncing = rowSyncing === key;
                const canPush =
                  r.status === "aarla_higher" && r.shopifyLinkCount <= 1;
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
                        : `Shopify Available is ${r.shopifyAvailable}; Studio is ${r.aarlaStudio}.`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {canPush ? (
                          <button
                            type="button"
                            disabled={pending || !!rowSyncing}
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
                          disabled={pending || !!rowSyncing}
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
            Push Available when Studio is correct. Sync after fixing Shopify Admin. Aligned rows
            drop off this list.
          </p>
        </div>
      ) : rows.length > 0 ? (
        <p className="text-sm text-charcoal/55 rounded-xl border border-border bg-white px-4 py-6">
          No mismatches — Studio and Shopify available are aligned for linked variants.
        </p>
      ) : (
        <p className="text-sm text-charcoal/55">
          Click <strong>Show mismatches</strong> to load the table. Empty means everything matched
          (or catalog is not Shopify-linked yet).
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
              Prefer per-row Push Available or Sync. Bulk tools are for catch-up only.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run("push")}>
                Push all Studio → Shopify
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
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

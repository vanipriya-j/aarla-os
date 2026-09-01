"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  syncShopifyInventoryChunkViaApi,
  unlockCommerceSyncLockViaApi,
} from "@/lib/client/commerce-sync-api";
import {
  newCommerceSyncLockToken,
  runChunkWithAutoRetry,
} from "@/lib/client/commerce-sync-auto-retry";
import type { InventoryDriftRow } from "@/lib/domain/inventory-drift";
import { ArrowDownUp, RefreshCw, Upload, Download } from "lucide-react";

type Action = "compare" | "push" | "pull";

/**
 * Drift board + bidirectional inventory sync.
 * Sales stay on Shopify; manufacture/ops stay on Aarla; stock is reconciled here.
 */
export function InventoryShopifySyncPanel({ onDone }: { onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryDriftRow[]>([]);
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
          ? "Comparing Shopify available vs Aarla Studio…"
          : action === "push"
            ? "Pushing Aarla Studio → Shopify…"
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
            `Read ${res.data.variantsRead} · drifted ${drifted} · matched ${matched}` +
              (action === "push" ? ` · pushed ${pushed}` : "") +
              (action === "pull" ? ` · pulled ${pulled}` : "") +
              (res.data.hasMore ? "…" : ""),
          );
          if (!res.data.hasMore) break;
          cursor = res.data.nextCursor ?? null;
          if (!cursor) break;
        }
        setRows(collected);
        setTotals({ matched, drifted, aarlaHigher, shopifyHigher, pushed, pulled });
        setStatus(
          action === "compare"
            ? `Compare done — ${drifted} drifted, ${matched} matched.`
            : action === "push"
              ? `Push done — set ${pushed} Shopify qty from Aarla Studio.`
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

  return (
    <div className="space-y-4" data-testid="inventory-shopify-sync-panel">
      <div className="rounded-xl border border-border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-deep-navy flex items-center gap-2">
              <ArrowDownUp className="h-5 w-5" /> Shopify stock sync
            </h2>
            <p className="text-sm text-charcoal/65 mt-1 max-w-2xl">
              Sales stay on Shopify. Manufacture / receive / transfer stay in Aarla. Compare drift,
              then <strong>Push</strong> (Aarla → Shopify) after ops, or <strong>Pull</strong>{" "}
              (Shopify → Aarla) when storefront qty should win.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run("compare")}>
              <RefreshCw className="h-4 w-4" />
              Compare
            </Button>
            <Button size="sm" disabled={pending} onClick={() => run("push")}>
              <Upload className="h-4 w-4" />
              Push to Shopify
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("pull")}>
              <Download className="h-4 w-4" />
              Pull to Aarla
            </Button>
          </div>
        </div>
        <p className="text-xs text-charcoal/50">
          Compare / Pull use the same Shopify qty field as Import base inventory. Push needs live{" "}
          <code>write_inventory</code> + <code>read_locations</code> on the store token (new app
          version alone is not enough — reinstall, or clear a stale{" "}
          <code>SHOPIFY_ADMIN_API_ACCESS_TOKEN</code> in Vercel).
        </p>
        {status ? <p className="text-sm text-deep-navy">{status}</p> : null}
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {(totals.drifted > 0 || totals.matched > 0) && (
          <p className="text-xs text-charcoal/55">
            Drifted {totals.drifted} · Matched {totals.matched} · Aarla higher{" "}
            {totals.aarlaHigher} · Shopify higher {totals.shopifyHigher}
            {totals.pushed ? ` · Pushed ${totals.pushed}` : ""}
            {totals.pulled ? ` · Pulled ${totals.pulled}` : ""}
          </p>
        )}
      </div>

      {rows.length > 0 ? (
        <div className="rounded-xl border border-border bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-charcoal/45 border-b border-border">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Aarla Studio</th>
                <th className="px-4 py-3">Shopify</th>
                <th className="px-4 py-3">Delta</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.productId}:${r.variantId}`} className="border-b border-border/70">
                  <td className="px-4 py-3 font-medium text-deep-navy">{r.label}</td>
                  <td className="px-4 py-3 text-charcoal/60">{r.sku || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{r.aarlaStudio}</td>
                  <td className="px-4 py-3 tabular-nums">{r.shopifyAvailable}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wide text-charcoal/50">
                    {r.status === "match"
                      ? "Match"
                      : r.status === "aarla_higher"
                        ? "Aarla higher"
                        : "Shopify higher"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-charcoal/55">
          Run Compare to see mismatches. Empty after compare means matched variants only (or no
          Shopify-linked catalog yet).
        </p>
      )}
    </div>
  );
}

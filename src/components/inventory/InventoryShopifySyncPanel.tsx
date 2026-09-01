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
import { ArrowDownUp, RefreshCw, ExternalLink } from "lucide-react";

type Action = "compare" | "push" | "pull";

/**
 * Stock mismatch board — Shopify available vs Aarla Studio.
 * Primary job: show where they differ so founders can one-time fix in Shopify Admin.
 * Push/Pull remain optional advanced tools, not the default workflow.
 */
export function InventoryShopifySyncPanel({ onDone }: { onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
        setRows(collected);
        setTotals({ matched, drifted, aarlaHigher, shopifyHigher, pushed, pulled });
        setStatus(
          action === "compare"
            ? `Mismatch table ready — ${drifted} to review, ${matched} already aligned.`
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
              Not a full two-way sync. Show where <strong>Shopify available</strong> (Aarla Office)
              differs from <strong>Aarla Studio</strong>, then fix once in Shopify Admin if needed.
            </p>
            <p className="text-xs text-charcoal/50 mt-2 max-w-2xl">
              Going forward: <strong>Receive</strong> into Studio → that qty should be{" "}
              <em>Available</em> at Aarla Office. Manufacture / WIP stays in Aarla until receive —
              Shopify “Committed” is for open orders, not manufacturing.
            </p>
          </div>
          <Button size="sm" disabled={pending} onClick={() => run("compare")}>
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
                <th className="px-4 py-3">Fix hint</th>
                <th className="px-4 py-3">Shopify</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((r) => (
                <tr key={`${r.productId}:${r.variantId}`} className="border-b border-border/70">
                  <td className="px-4 py-3 font-medium text-deep-navy">{r.label}</td>
                  <td className="px-4 py-3 text-charcoal/60">{r.sku || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{r.aarlaStudio}</td>
                  <td className="px-4 py-3 tabular-nums">{r.shopifyAvailable}</td>
                  <td className="px-4 py-3 text-xs text-charcoal/70">
                    {r.status === "aarla_higher"
                      ? `Set Shopify available to ${r.aarlaStudio} (or leave if Shopify is intentionally lower)`
                      : `Shopify has ${r.shopifyAvailable}; Studio shows ${r.aarlaStudio} — check sales not yet in Aarla, or set Shopify to ${r.aarlaStudio}`}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`https://admin.shopify.com/store/${
                        (typeof process !== "undefined" && false) || "aarla"
                      }/products`}
                      className="inline-flex items-center gap-1 text-xs text-deep-navy hover:text-aarla-red"
                      target="_blank"
                      rel="noreferrer"
                      title="Open Shopify Admin products (search by SKU)"
                    >
                      Admin <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-charcoal/50 border-t border-border">
            One-time cleanup: open Shopify Admin → product inventory at <strong>Aarla Office</strong>{" "}
            → set Available to match Studio (or the truth you choose). No need to Push/Pull the
            whole catalog.
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
              Optional only. Prefer fixing individual rows in Shopify Admin. Push overwrites Shopify
              available from Studio; Pull writes Aarla adjustments from Shopify.
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

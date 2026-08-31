"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { getShopifyCommerceDiagnosticsAction } from "@/app/actions/shopify-sync-actions";
import { useCommerceSync } from "@/components/customer-calls/CommerceSyncProvider";
import type {
  CommerceCustomerDiagnostic,
  ShopifySyncSummary,
} from "@/lib/domain/external-commerce-types";
import {
  emptyShopifySyncSummary,
  mergeShopifySyncSummaries,
} from "@/lib/domain/external-commerce-types";
import { syncShopifyChunkViaApi } from "@/lib/client/commerce-sync-api";
import { formatCommerceSyncFailure } from "@/lib/client/commerce-sync-errors";
import { formatOrdersLoaded } from "@/lib/client/commerce-sync-progress";
import { DiagnosticsPagination } from "@/components/customer-calls/DiagnosticsPagination";
import { Hourglass, Loader2, RefreshCw } from "lucide-react";

const PAGE_SIZE = 50;

function SummaryGrid({ summary }: { summary: ShopifySyncSummary }) {
  const items: Array<[string, number | string]> = [
    ["Customers read", summary.customersRead],
    ["Customers added", summary.customersAdded],
    ["Customers updated", summary.customersUpdated],
    ["Orders read", summary.ordersRead],
    ["Orders in Shopify (this filter)", summary.ordersTotal ?? "—"],
    ["Orders added", summary.ordersAdded],
    ["Orders updated", summary.ordersUpdated],
    ["Fulfilments found", summary.fulfilmentsFound],
    ["AWBs found", summary.awbsFound],
    ["Records skipped", summary.recordsSkipped],
    ["Pages fetched", summary.pagesFetched ?? 0],
    ["Errors", summary.errors.length],
    ["Status", summary.complete ? "Complete" : summary.hasMore ? "More remaining" : "Stopped"],
  ];
  return (
    <dl
      className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm"
      data-testid="shopify-sync-summary"
    >
      {items.map(([label, value]) => (
        <div key={label} className="border border-border rounded-lg px-3 py-2">
          <dt className="text-xs text-charcoal/55">{label}</dt>
          <dd className="font-medium text-deep-navy mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ShopifySyncPanel() {
  const { busy, activeSync, beginSync, endSync } = useCommerceSync();
  const syncingHere = activeSync === "shopify";
  const [summary, setSummary] = useState<ShopifySyncSummary | null>(null);
  const [diagnostics, setDiagnostics] = useState<CommerceCustomerDiagnostic[]>([]);
  const [diagnosticsLoaded, setDiagnosticsLoaded] = useState(false);
  const [diagPage, setDiagPage] = useState(1);
  const [diagTotal, setDiagTotal] = useState(0);
  const [diagTotalPages, setDiagTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [diagPending, startDiagTransition] = useTransition();

  const loadDiagnostics = useCallback((page = 1) => {
    startDiagTransition(async () => {
      const res = await getShopifyCommerceDiagnosticsAction(page, PAGE_SIZE);
      setDiagnosticsLoaded(true);
      if (!res.ok) {
        setError(res.error);
        setDiagnostics([]);
        return;
      }
      setError(null);
      setDiagnostics(res.data.rows);
      setDiagPage(res.data.page);
      setDiagTotal(res.data.total);
      setDiagTotalPages(res.data.totalPages);
    });
  }, []);

  // Cheap aggregated query — safe to show on open (not a sync).
  useEffect(() => {
    loadDiagnostics(1);
  }, [loadDiagnostics]);

  async function handleSync() {
    const token = beginSync("shopify");
    if (!token) {
      setError("A sync is already in progress.");
      return;
    }

    setError(null);
    setStatus("Asking Shopify how many orders to load…");
    let cursor: string | null = null;
    let total = emptyShopifySyncSummary();
    let guard = 0;
    const maxChunks = 80; // safety against runaway loops

    try {
      while (guard < maxChunks) {
        guard += 1;
        setStatus(
          total.ordersTotal != null
            ? `${formatOrdersLoaded(total.ordersRead, total.ordersTotal)}…`
            : total.ordersRead > 0
              ? `${formatOrdersLoaded(total.ordersRead)}…`
              : "Loading Shopify orders…",
        );
        let res;
        try {
          res = await syncShopifyChunkViaApi(cursor, token, "incremental");
        } catch (err) {
          setError(formatCommerceSyncFailure(err));
          setSummary(total.ordersRead > 0 || total.customersRead > 0 ? total : null);
          setStatus(null);
          return;
        }
        if (!res.ok) {
          setError(res.error);
          setSummary(total.ordersRead > 0 || total.customersRead > 0 ? total : null);
          setStatus(null);
          return;
        }
        total = mergeShopifySyncSummaries(total, res.data);
        setSummary({ ...total });
        setStatus(
          `${formatOrdersLoaded(total.ordersRead, total.ordersTotal)}` +
            (res.data.hasMore ? "…" : " — Shopify done"),
        );

        if (res.data.errors.length && !res.data.complete) {
          setError(res.data.errors.slice(0, 3).join(" · "));
          setStatus("Stopped — Shopify incomplete. Clear lock, then sync again (resumes).");
          return;
        }

        if (!res.data.hasMore) break;
        cursor = res.data.nextCursor ?? null;
        if (!cursor) break;
      }

      if (total.hasMore || !total.complete) {
        setStatus(
          `${formatOrdersLoaded(total.ordersRead, total.ordersTotal)} — more remain. Sync again — it resumes.`,
        );
      } else {
        setStatus(
          `Shopify sync complete — ${formatOrdersLoaded(total.ordersRead, total.ordersTotal)}.`,
        );
      }
      const diag = await getShopifyCommerceDiagnosticsAction(1, PAGE_SIZE);
      setDiagnosticsLoaded(true);
      if (diag.ok) {
        setDiagnostics(diag.data.rows);
        setDiagPage(diag.data.page);
        setDiagTotal(diag.data.total);
        setDiagTotalPages(diag.data.totalPages);
      }
    } catch (err) {
      setError(formatCommerceSyncFailure(err));
      setStatus(null);
    } finally {
      await endSync(token);
    }
  }

  return (
    <div className="space-y-4" data-testid="shopify-sync-panel">
      <FormSection
        title="Shopify commerce sync"
        description="Default sync is incremental (new orders since last success). Progress shows Loaded X of Y. Does not start on page load. Does not refresh call queues."
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            data-testid="sync-shopify-data"
            onClick={() => void handleSync()}
            disabled={busy}
            aria-busy={syncingHere}
            className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white hover:bg-deep-navy/90 disabled:opacity-60"
          >
            {syncingHere ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            {syncingHere ? "Syncing new orders…" : "Sync new Shopify orders"}
          </button>
          {busy ? (
            <StatusChip
              label={syncingHere ? "Working…" : "Waiting — another sync is running"}
              tone="neutral"
            />
          ) : null}
        </div>
        {syncingHere || status ? (
          <div
            className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-soft-beige/60 px-3 py-2.5"
            role="status"
            aria-live="polite"
          >
            {syncingHere ? (
              <Hourglass className="h-4 w-4 mt-0.5 shrink-0 text-deep-navy animate-pulse" aria-hidden />
            ) : null}
            <p className="text-sm text-charcoal/70" data-testid="shopify-sync-status">
              {status ?? "Working — please wait…"}
            </p>
            {syncingHere ? (
              <Loader2 className="h-4 w-4 mt-0.5 ml-auto shrink-0 animate-spin text-deep-navy" aria-hidden />
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-aarla-red mb-3" data-testid="shopify-sync-error">
            {error}
          </p>
        ) : null}

        {summary ? <SummaryGrid summary={summary} /> : null}
        {summary?.errors.length ? (
          <ul className="mt-3 text-xs text-charcoal/60 list-disc pl-5 space-y-1">
            {summary.errors.slice(0, 5).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
      </FormSection>

      <FormSection
        title="Synced commerce diagnostics"
        description="Review-only view, 50 customers per page (A–Z). Personal data is masked."
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            data-testid="load-shopify-diagnostics"
            onClick={() => loadDiagnostics(diagPage)}
            disabled={diagPending || busy}
            className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 border border-border text-deep-navy hover:border-aarla-red/40 disabled:opacity-60"
          >
            {diagPending ? "Loading…" : "Refresh diagnostics"}
          </button>
        </div>
        {!diagnosticsLoaded ? (
          <p className="text-sm text-charcoal/60" data-testid="shopify-diagnostics-idle">
            {diagPending ? "Loading saved Shopify rows…" : "Open this stage to load Shopify rows."}
          </p>
        ) : diagnostics.length === 0 ? (
          <p className="text-sm text-charcoal/60" data-testid="shopify-diagnostics-empty">
            {error ? error : "No synchronized Shopify customers yet."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto" data-testid="shopify-diagnostics-table">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-charcoal/55 border-b border-border">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 pr-3 font-medium">Contact</th>
                    <th className="py-2 pr-3 font-medium">Latest purchase</th>
                    <th className="py-2 pr-3 font-medium">Orders</th>
                    <th className="py-2 pr-3 font-medium">Last order</th>
                    <th className="py-2 pr-3 font-medium">Fulfilments</th>
                    <th className="py-2 pr-3 font-medium">Carrier</th>
                    <th className="py-2 font-medium">AWB</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostics.map((row) => (
                    <tr key={row.externalId} className="border-b border-border/70">
                      <td className="py-2.5 pr-3 text-deep-navy">{row.displayName}</td>
                      <td className="py-2.5 pr-3 text-charcoal/70">
                        {[row.phoneMasked, row.emailMasked].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        {row.latestValidOrderAt
                          ? new Date(row.latestValidOrderAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-3">{row.orderCount}</td>
                      <td className="py-2.5 pr-3">
                        {row.lastOrderNumber
                          ? `${row.lastOrderNumber}${
                              row.lastOrderDate
                                ? ` · ${new Date(row.lastOrderDate).toLocaleDateString()}`
                                : ""
                            }`
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-3">{row.fulfilmentCount}</td>
                      <td className="py-2.5 pr-3">{row.carriers.join(", ") || "—"}</td>
                      <td className="py-2.5">{row.awbAvailable ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DiagnosticsPagination
              page={diagPage}
              totalPages={diagTotalPages}
              total={diagTotal}
              pageSize={PAGE_SIZE}
              pending={diagPending}
              onPageChange={(next) => loadDiagnostics(next)}
              testId="shopify-diagnostics-pagination"
            />
          </>
        )}
      </FormSection>
    </div>
  );
}

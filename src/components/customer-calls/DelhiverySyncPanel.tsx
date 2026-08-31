"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { getDelhiveryShipmentDiagnosticsAction } from "@/app/actions/delhivery-sync-actions";
import { useCommerceSync } from "@/components/customer-calls/CommerceSyncProvider";
import type {
  DelhiverySyncSummary,
  ShipmentDiagnosticRow,
  ShipmentDiagnosticSort,
} from "@/lib/domain/shipment-types";
import {
  emptyDelhiverySyncSummary,
  formatShipmentStatusLabel,
  mergeDelhiverySyncSummaries,
  SHIPMENT_DIAGNOSTIC_SORTS,
} from "@/lib/domain/shipment-types";
import { syncDelhiveryChunkViaApi } from "@/lib/client/commerce-sync-api";
import { runChunkWithAutoRetry } from "@/lib/client/commerce-sync-auto-retry";
import { formatCommerceSyncFailure } from "@/lib/client/commerce-sync-errors";
import { formatAwbsTracked } from "@/lib/client/commerce-sync-progress";
import { DiagnosticsPagination } from "@/components/customer-calls/DiagnosticsPagination";
import { Hourglass, Loader2, Link2, Truck } from "lucide-react";

const PAGE_SIZE = 50;

const SORT_OPTIONS: Array<{ value: ShipmentDiagnosticSort; label: string }> = [
  { value: "last-synced", label: "Last synced" },
  { value: "ordered", label: "Ordered date" },
  { value: "promised", label: "Promised delivery" },
  { value: "delivered", label: "Actual delivery" },
  { value: "status", label: "Status" },
  { value: "customer", label: "Customer" },
  { value: "order", label: "Order number" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

/** Calendar-day delta: positive = late vs promised, negative = early. */
function deliveryVarianceLabel(
  promisedAt: string | null,
  deliveredAt: string | null,
): string | null {
  if (!promisedAt || !deliveredAt) return null;
  const promised = new Date(promisedAt);
  const delivered = new Date(deliveredAt);
  if (Number.isNaN(promised.getTime()) || Number.isNaN(delivered.getTime())) return null;
  const promisedDay = Date.UTC(
    promised.getFullYear(),
    promised.getMonth(),
    promised.getDate(),
  );
  const deliveredDay = Date.UTC(
    delivered.getFullYear(),
    delivered.getMonth(),
    delivered.getDate(),
  );
  const days = Math.round((deliveredDay - promisedDay) / 86_400_000);
  if (days === 0) return "On time";
  if (days > 0) return `${days}d late`;
  return `${Math.abs(days)}d early`;
}

function SummaryGrid({ summary }: { summary: DelhiverySyncSummary }) {
  const items: Array<[string, number | string]> = [
    ["Fulfilments evaluated", summary.fulfilmentsEvaluated],
    ["Delhivery AWBs found", summary.delhiveryAwbsFound],
    ["Unique AWBs tracked", summary.uniqueAwbsTracked],
    ["AWBs processed", summary.awbsProcessed ?? 0],
    ["Shipments created", summary.shipmentsCreated],
    ["Shipments updated", summary.shipmentsUpdated],
    ["Delivered", summary.delivered],
    ["In transit", summary.inTransit],
    ["Out for delivery", summary.outForDelivery],
    ["Returned", summary.returned],
    ["Cancelled", summary.cancelled],
    ["Unknown", summary.unknown],
    ["Failed lookups", summary.failedLookups],
    ["Skipped", summary.skippedRecords],
    ["Ambiguous AWB links", summary.ambiguousAwbLinkages],
    ["Status", summary.complete ? "Complete" : summary.hasMore ? "More remaining" : "Stopped"],
  ];
  return (
    <dl
      className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-sm"
      data-testid="delhivery-sync-summary"
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

export function DelhiverySyncPanel() {
  const { busy, activeSync, beginSync, endSync } = useCommerceSync();
  const syncingHere = activeSync === "delhivery";
  const [summary, setSummary] = useState<DelhiverySyncSummary | null>(null);
  const [rows, setRows] = useState<ShipmentDiagnosticRow[]>([]);
  const [diagnosticsLoaded, setDiagnosticsLoaded] = useState(false);
  const [diagPage, setDiagPage] = useState(1);
  const [diagTotal, setDiagTotal] = useState(0);
  const [diagTotalPages, setDiagTotalPages] = useState(1);
  const [diagSort, setDiagSort] = useState<ShipmentDiagnosticSort>("last-synced");
  const [copiedAwb, setCopiedAwb] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [diagPending, startDiagTransition] = useTransition();

  const loadDiagnostics = useCallback((page = 1, sort: ShipmentDiagnosticSort = diagSort) => {
    startDiagTransition(async () => {
      const safeSort = SHIPMENT_DIAGNOSTIC_SORTS.includes(sort) ? sort : "last-synced";
      const res = await getDelhiveryShipmentDiagnosticsAction(page, PAGE_SIZE, safeSort);
      setDiagnosticsLoaded(true);
      if (!res.ok) {
        setError(res.error);
        setRows([]);
        return;
      }
      setError(null);
      setRows(res.data.rows);
      setDiagPage(res.data.page);
      setDiagTotal(res.data.total);
      setDiagTotalPages(res.data.totalPages);
      setDiagSort(safeSort);
    });
  }, [diagSort]);

  // Read-only table load — not a Delhivery API sync.
  useEffect(() => {
    loadDiagnostics(1, "last-synced");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  function handleSortChange(next: ShipmentDiagnosticSort) {
    setDiagSort(next);
    loadDiagnostics(1, next);
  }

  async function copyTrackingUrl(awb: string, url: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopiedAwb(awb);
        window.setTimeout(() => {
          setCopiedAwb((current) => (current === awb ? null : current));
        }, 2000);
      }
    } catch {
      // Clipboard denied — URL still available via browser share if needed.
    }
  }

  async function handleSync() {
    const token = beginSync("delhivery");
    if (!token) {
      setError("A sync is already in progress.");
      return;
    }

    const lockTokenRef = { current: token };
    setError(null);
    setStatus("Resuming Delhivery tracking from last saved offset…");
    // null = server loads saved resume offset (does not restart at 0).
    let offset: number | null = null;
    let total = emptyDelhiverySyncSummary();
    let guard = 0;
    // 400 × 10 AWBs — enough for full historical backfill under small chunks.
    const maxChunks = 400;

    try {
      while (guard < maxChunks) {
        guard += 1;
        const res = await runChunkWithAutoRetry({
          getToken: () => lockTokenRef.current,
          setToken: (t) => {
            lockTokenRef.current = t;
          },
          onRetry: (attempt, maxAttempts) => {
            setError(null);
            setStatus(
              `Server timed out — unlocking and retrying ${attempt}/${maxAttempts}…`,
            );
          },
          attempt: (tok) => syncDelhiveryChunkViaApi(offset, tok),
        });
        if (!res.ok) {
          setError(res.error);
          setSummary(
            (total.awbsProcessed ?? 0) > 0 || total.shipmentsCreated > 0 ? total : null,
          );
          setStatus(
            "Stopped after automatic retries — click Update tracking only again to resume.",
          );
          return;
        }
        total = mergeDelhiverySyncSummaries(total, res.data);
        const through = res.data.complete
          ? (res.data.uniqueAwbsTracked || total.awbsProcessed || 0)
          : (res.data.nextOffset ?? total.awbsProcessed ?? 0);
        setSummary({ ...total });
        setStatus(
          `${formatAwbsTracked(through, total.uniqueAwbsTracked || null)}` +
            (res.data.hasMore ? "…" : " — done"),
        );

        if (res.data.errors.length && !res.data.hasMore) {
          setError(res.data.errors.slice(0, 3).join(" · "));
        }

        if (!res.data.hasMore) break;
        offset = res.data.nextOffset ?? null;
        if (offset == null) break;
      }

      const unique = total.uniqueAwbsTracked;
      const through = total.complete ? unique : (offset ?? total.awbsProcessed ?? 0);
      setStatus(
        total.complete
          ? `Delhivery sync complete — ${formatAwbsTracked(through, unique)}.`
          : `Delhivery sync paused — ${formatAwbsTracked(through, unique)}. Click Update tracking only again.`,
      );
      const diag = await getDelhiveryShipmentDiagnosticsAction(1, PAGE_SIZE, diagSort);
      setDiagnosticsLoaded(true);
      if (diag.ok) {
        setRows(diag.data.rows);
        setDiagPage(diag.data.page);
        setDiagTotal(diag.data.total);
        setDiagTotalPages(diag.data.totalPages);
      }
    } catch (err) {
      setError(formatCommerceSyncFailure(err));
      setStatus(null);
    } finally {
      await endSync(lockTokenRef.current);
    }
  }

  return (
    <div className="space-y-4" data-testid="delhivery-sync-panel">
      <FormSection
        title="Delhivery tracking"
        description="Optional: refresh Delhivery tracking only (no Shopify pull). Continues from the last saved AWB offset — does not restart at 0. Clear stuck lock resets. Prefer Sync on the Shopify stage for the full pipeline."
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            data-testid="sync-delhivery-shipments"
            onClick={() => void handleSync()}
            disabled={busy}
            aria-busy={syncingHere}
            className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white hover:bg-deep-navy/90 disabled:opacity-60"
          >
            {syncingHere ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Truck className="h-4 w-4" aria-hidden />
            )}
            {syncingHere ? "Updating tracking…" : "Update tracking only"}
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
            <p className="text-sm text-charcoal/70" data-testid="delhivery-sync-status">
              {status ?? "Working — please wait…"}
            </p>
            {syncingHere ? (
              <Loader2 className="h-4 w-4 mt-0.5 ml-auto shrink-0 animate-spin text-deep-navy" aria-hidden />
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-aarla-red mb-3" data-testid="delhivery-sync-error">
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
        title="Shipment details"
        description="Order, customer, last known status, and promised vs actual delivery — 50 rows per page. Empty until Delhivery sync completes."
      >
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="flex flex-col gap-1 text-xs text-charcoal/60">
            Sort by
            <select
              data-testid="delhivery-diagnostics-sort"
              value={diagSort}
              disabled={diagPending || busy}
              onChange={(e) =>
                handleSortChange(e.target.value as ShipmentDiagnosticSort)
              }
              className="min-w-[11rem] rounded-md border border-border bg-white px-3 py-2 text-sm text-deep-navy disabled:opacity-60"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="load-delhivery-diagnostics"
            onClick={() => loadDiagnostics(diagPage, diagSort)}
            disabled={diagPending || busy}
            className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 border border-border text-deep-navy hover:border-aarla-red/40 disabled:opacity-60"
          >
            {diagPending ? "Loading…" : "Refresh"}
          </button>
        </div>
        {!diagnosticsLoaded ? (
          <p className="text-sm text-charcoal/60" data-testid="delhivery-diagnostics-idle">
            {diagPending ? "Loading saved shipment rows…" : "Open this stage to load shipment rows."}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-charcoal/60" data-testid="delhivery-diagnostics-empty">
            {error
              ? error
              : "No shipment records yet. Use Sync on the Shopify stage, or Update tracking only here."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto" data-testid="delhivery-diagnostics-table">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-charcoal/55 border-b border-border">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Order No</th>
                    <th className="py-2 pr-4 font-medium">Customer Name</th>
                    <th className="py-2 pr-4 font-medium">Location</th>
                    <th className="py-2 pr-4 font-medium">Last known status</th>
                    <th className="py-2 pr-4 font-medium">Promised</th>
                    <th className="py-2 pr-4 font-medium">Actual</th>
                    <th className="py-2 pr-4 font-medium">Ordered</th>
                    <th className="py-2 font-medium">Track</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const variance = deliveryVarianceLabel(
                      row.promisedDeliveryAt,
                      row.deliveredAt,
                    );
                    const trackingUrl = row.trackingUrl;
                    const copied = copiedAwb === row.awb;
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border/70"
                        data-testid={`shipment-row-${row.awb}`}
                        data-status={row.normalizedStatus}
                      >
                        <td className="py-2.5 pr-4 text-deep-navy font-medium">
                          {row.orderNumber ?? "—"}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span>{row.customerName ?? "—"}</span>
                          {row.syncError ? (
                            <span className="block text-xs text-aarla-red/90 mt-0.5">
                              {row.syncError}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-4">{row.latestScanLocation ?? "—"}</td>
                        <td className="py-2.5 pr-4">
                          <span data-testid={`shipment-status-${row.awb}`}>
                            {formatShipmentStatusLabel(
                              row.normalizedStatus,
                              row.providerStatus,
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          {formatDate(row.promisedDeliveryAt)}
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          <span>{formatDate(row.deliveredAt)}</span>
                          {variance ? (
                            <span className="block text-xs text-charcoal/55 mt-0.5">
                              {variance}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-4">{formatDate(row.orderedAt)}</td>
                        <td className="py-2.5">
                          {trackingUrl ? (
                            <button
                              type="button"
                              data-testid={`copy-tracking-${row.awb}`}
                              onClick={() => void copyTrackingUrl(row.awb, trackingUrl)}
                              className="inline-flex items-center gap-1.5 text-xs text-deep-navy hover:text-aarla-red"
                              title={trackingUrl}
                            >
                              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {copied ? "Copied" : "Copy URL"}
                            </button>
                          ) : (
                            <span className="text-charcoal/40">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DiagnosticsPagination
              page={diagPage}
              totalPages={diagTotalPages}
              total={diagTotal}
              pageSize={PAGE_SIZE}
              pending={diagPending}
              onPageChange={(next) => loadDiagnostics(next, diagSort)}
              testId="delhivery-diagnostics-pagination"
            />
          </>
        )}
      </FormSection>
    </div>
  );
}

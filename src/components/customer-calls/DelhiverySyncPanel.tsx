"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { getDelhiveryShipmentDiagnosticsAction } from "@/app/actions/delhivery-sync-actions";
import { useCommerceSync } from "@/components/customer-calls/CommerceSyncProvider";
import type {
  DelhiverySyncSummary,
  ShipmentDiagnosticRow,
} from "@/lib/domain/shipment-types";
import {
  emptyDelhiverySyncSummary,
  mergeDelhiverySyncSummaries,
} from "@/lib/domain/shipment-types";
import { syncDelhiveryChunkViaApi } from "@/lib/client/commerce-sync-api";
import { formatCommerceSyncFailure } from "@/lib/client/commerce-sync-errors";
import { DiagnosticsPagination } from "@/components/customer-calls/DiagnosticsPagination";
import { Hourglass, Loader2, Truck } from "lucide-react";

const PAGE_SIZE = 50;

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
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [diagPending, startDiagTransition] = useTransition();

  const loadDiagnostics = useCallback((page = 1) => {
    startDiagTransition(async () => {
      const res = await getDelhiveryShipmentDiagnosticsAction(page, PAGE_SIZE);
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
    });
  }, []);

  // Read-only table load — not a Delhivery API sync.
  useEffect(() => {
    loadDiagnostics(1);
  }, [loadDiagnostics]);

  async function handleSync() {
    const token = beginSync("delhivery");
    if (!token) {
      setError("A sync is already in progress.");
      return;
    }

    setError(null);
    setStatus("Click received — starting Delhivery sync…");
    let offset: number | null = 0;
    let total = emptyDelhiverySyncSummary();
    let guard = 0;
    const maxChunks = 80;

    try {
      while (guard < maxChunks) {
        guard += 1;
        setStatus(
          offset
            ? `Syncing chunk ${guard} (offset ${offset})…`
            : `Syncing chunk ${guard}…`,
        );
        let res;
        try {
          res = await syncDelhiveryChunkViaApi(offset, token);
        } catch (err) {
          setError(formatCommerceSyncFailure(err));
          setSummary(
            (total.awbsProcessed ?? 0) > 0 || total.shipmentsCreated > 0 ? total : null,
          );
          setStatus(null);
          return;
        }
        if (!res.ok) {
          setError(res.error);
          setSummary(
            (total.awbsProcessed ?? 0) > 0 || total.shipmentsCreated > 0 ? total : null,
          );
          setStatus(null);
          return;
        }
        total = mergeDelhiverySyncSummaries(total, res.data);
        setSummary({ ...total });

        if (res.data.errors.length && !res.data.hasMore) {
          setError(res.data.errors.slice(0, 3).join(" · "));
        }

        if (!res.data.hasMore) break;
        offset = res.data.nextOffset ?? null;
        if (offset == null) break;
      }

      setStatus(
        total.complete
          ? "Delhivery sync complete."
          : "Delhivery sync paused — click Sync again to continue.",
      );
      const diag = await getDelhiveryShipmentDiagnosticsAction(1, PAGE_SIZE);
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
      await endSync(token);
    }
  }

  return (
    <div className="space-y-4" data-testid="delhivery-sync-panel">
      <FormSection
        title="Delhivery shipment sync"
        description="Tracks AWBs in small chunks so Vercel does not time out. Does not start on page load. Does not create call queue items."
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
            {syncingHere ? "Syncing Delhivery…" : "Sync Delhivery Shipments"}
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
        description="Order, customer, location, and dates — 50 rows per page. Empty until Delhivery sync completes."
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            data-testid="load-delhivery-diagnostics"
            onClick={() => loadDiagnostics(diagPage)}
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
              : "No shipment records yet. Sync after Shopify fulfilments with AWBs exist."}
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
                    <th className="py-2 pr-4 font-medium">Delivered</th>
                    <th className="py-2 font-medium">Ordered</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
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
                        {row.deliveredAt
                          ? new Date(row.deliveredAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-2.5">
                        {row.orderedAt
                          ? new Date(row.orderedAt).toLocaleDateString()
                          : "—"}
                      </td>
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
              testId="delhivery-diagnostics-pagination"
            />
          </>
        )}
      </FormSection>
    </div>
  );
}

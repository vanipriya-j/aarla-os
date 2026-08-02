"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  getDelhiveryShipmentDiagnosticsAction,
  syncDelhiveryShipmentsAction,
} from "@/app/actions/delhivery-sync-actions";
import type {
  DelhiverySyncSummary,
  ShipmentDiagnosticRow,
} from "@/lib/domain/shipment-types";
import { Truck } from "lucide-react";

function SummaryGrid({ summary }: { summary: DelhiverySyncSummary }) {
  const items: Array<[string, number]> = [
    ["Fulfilments evaluated", summary.fulfilmentsEvaluated],
    ["Delhivery AWBs found", summary.delhiveryAwbsFound],
    ["Unique AWBs tracked", summary.uniqueAwbsTracked],
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
  const [summary, setSummary] = useState<DelhiverySyncSummary | null>(null);
  const [rows, setRows] = useState<ShipmentDiagnosticRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadDiagnostics = useCallback(() => {
    startTransition(async () => {
      const res = await getDelhiveryShipmentDiagnosticsAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows(res.data);
    });
  }, []);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  function handleSync() {
    startTransition(async () => {
      setError(null);
      const res = await syncDelhiveryShipmentsAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSummary(res.data);
      if (res.data.errors.length) {
        setError(res.data.errors.slice(0, 3).join(" · "));
      }
      const diag = await getDelhiveryShipmentDiagnosticsAction();
      if (diag.ok) setRows(diag.data);
    });
  }

  return (
    <div className="space-y-4" data-testid="delhivery-sync-panel">
      <FormSection
        title="Delhivery shipment sync"
        description="Track AWBs from Shopify fulfilments. Does not create call queue items. Previous valid statuses are preserved on lookup failure."
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            data-testid="sync-delhivery-shipments"
            onClick={handleSync}
            disabled={pending}
            className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white hover:bg-deep-navy/90 disabled:opacity-60"
          >
            <Truck className="h-4 w-4" />
            Sync Delhivery Shipments
          </button>
          {pending ? <StatusChip label="Syncing…" tone="neutral" /> : null}
        </div>

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
        title="Shipment diagnostics"
        description="Normalized Delhivery status only — not proof for call eligibility yet."
      >
        {rows.length === 0 ? (
          <p className="text-sm text-charcoal/60" data-testid="delhivery-diagnostics-empty">
            No shipment records yet. Sync after Shopify fulfilments with AWBs exist.
          </p>
        ) : (
          <div className="overflow-x-auto" data-testid="delhivery-diagnostics-table">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-charcoal/55 border-b border-border">
                <tr>
                  <th className="py-2 pr-3 font-medium">AWB</th>
                  <th className="py-2 pr-3 font-medium">Order</th>
                  <th className="py-2 pr-3 font-medium">Carrier</th>
                  <th className="py-2 pr-3 font-medium">Normalized</th>
                  <th className="py-2 pr-3 font-medium">Provider</th>
                  <th className="py-2 pr-3 font-medium">Delivered</th>
                  <th className="py-2 pr-3 font-medium">Latest scan</th>
                  <th className="py-2 pr-3 font-medium">Location</th>
                  <th className="py-2 pr-3 font-medium">Last sync</th>
                  <th className="py-2 font-medium">Sync error</th>
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
                    <td className="py-2.5 pr-3 text-deep-navy font-medium">{row.awb}</td>
                    <td className="py-2.5 pr-3">{row.orderNumber ?? "—"}</td>
                    <td className="py-2.5 pr-3">{row.carrier}</td>
                    <td className="py-2.5 pr-3">{row.normalizedStatus}</td>
                    <td className="py-2.5 pr-3">{row.providerStatus ?? "—"}</td>
                    <td className="py-2.5 pr-3">
                      {row.deliveredAt
                        ? new Date(row.deliveredAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {row.latestScanAt
                        ? new Date(row.latestScanAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3">{row.latestScanLocation ?? "—"}</td>
                    <td className="py-2.5 pr-3">
                      {new Date(row.lastSyncedAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 text-aarla-red/90">{row.syncError ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormSection>
    </div>
  );
}

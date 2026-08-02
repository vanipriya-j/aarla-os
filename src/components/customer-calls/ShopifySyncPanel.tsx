"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  getShopifyCommerceDiagnosticsAction,
  syncShopifyCustomerCallDataAction,
} from "@/app/actions/shopify-sync-actions";
import type {
  CommerceCustomerDiagnostic,
  ShopifySyncSummary,
} from "@/lib/domain/external-commerce-types";
import { RefreshCw } from "lucide-react";

function SummaryGrid({ summary }: { summary: ShopifySyncSummary }) {
  const items: Array<[string, number | string]> = [
    ["Customers read", summary.customersRead],
    ["Customers added", summary.customersAdded],
    ["Customers updated", summary.customersUpdated],
    ["Orders read", summary.ordersRead],
    ["Orders added", summary.ordersAdded],
    ["Orders updated", summary.ordersUpdated],
    ["Fulfilments found", summary.fulfilmentsFound],
    ["AWBs found", summary.awbsFound],
    ["Records skipped", summary.recordsSkipped],
    ["Errors", summary.errors.length],
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
  const [summary, setSummary] = useState<ShopifySyncSummary | null>(null);
  const [diagnostics, setDiagnostics] = useState<CommerceCustomerDiagnostic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadDiagnostics = useCallback(() => {
    startTransition(async () => {
      const res = await getShopifyCommerceDiagnosticsAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDiagnostics(res.data);
    });
  }, []);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  function handleSync() {
    startTransition(async () => {
      setError(null);
      const res = await syncShopifyCustomerCallDataAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSummary(res.data);
      if (res.data.errors.length) {
        setError(res.data.errors.slice(0, 3).join(" · "));
      }
      const diag = await getShopifyCommerceDiagnosticsAction();
      if (diag.ok) setDiagnostics(diag.data);
    });
  }

  return (
    <div className="space-y-4" data-testid="shopify-sync-panel">
      <FormSection
        title="Shopify commerce sync"
        description="Pull customers, orders, products, and fulfilment tracking into Aarla OS. Does not refresh call queues."
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            data-testid="sync-shopify-data"
            onClick={handleSync}
            disabled={pending}
            className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white hover:bg-deep-navy/90 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
            Sync Shopify Data
          </button>
          {pending ? <StatusChip label="Syncing…" tone="neutral" /> : null}
        </div>

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
        description="Review-only view. Personal data is masked. Fulfilment tracking is not proof of physical delivery."
      >
        {diagnostics.length === 0 ? (
          <p className="text-sm text-charcoal/60" data-testid="shopify-diagnostics-empty">
            No synchronized Shopify customers yet.
          </p>
        ) : (
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
        )}
      </FormSection>
    </div>
  );
}

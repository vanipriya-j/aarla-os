"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FormSection } from "@/components/ui/FormSection";
import { getShopifyCommerceDiagnosticsAction } from "@/app/actions/shopify-sync-actions";
import { useCommerceSync } from "@/components/customer-calls/CommerceSyncProvider";
import type { CommerceCustomerDiagnostic } from "@/lib/domain/external-commerce-types";
import { DiagnosticsPagination } from "@/components/customer-calls/DiagnosticsPagination";

const PAGE_SIZE = 50;

/** Diagnostics only — use the single Sync button in Commerce sync. */
export function ShopifySyncPanel() {
  const { busy } = useCommerceSync();
  const [diagnostics, setDiagnostics] = useState<CommerceCustomerDiagnostic[]>([]);
  const [diagnosticsLoaded, setDiagnosticsLoaded] = useState(false);
  const [diagPage, setDiagPage] = useState(1);
  const [diagTotal, setDiagTotal] = useState(0);
  const [diagTotalPages, setDiagTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    loadDiagnostics(1);
  }, [loadDiagnostics]);

  return (
    <div className="space-y-4" data-testid="shopify-sync-panel">
      <FormSection
        title="Synced commerce diagnostics"
        description="Review-only view of customers already synced. 50 per page (A–Z). Personal data is masked. Use Sync above to pull commerce data."
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
            {error ? error : "No synchronized Shopify customers yet. Use Sync above."}
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

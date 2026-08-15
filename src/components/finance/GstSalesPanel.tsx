"use client";

import type { GstSalesRow, GstSalesTotals } from "@/lib/domain/gst-types";

function inr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

export function GstSalesPanel({
  totals,
  rows,
}: {
  totals: GstSalesTotals;
  rows: GstSalesRow[];
}) {
  return (
    <div className="space-y-4" data-testid="gst-sales">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-xs text-charcoal/50 uppercase tracking-wide">Orders</p>
          <p className="font-display text-xl text-deep-navy">{totals.orderCount}</p>
        </div>
        <div>
          <p className="text-xs text-charcoal/50 uppercase tracking-wide">Gross</p>
          <p className="font-display text-xl text-deep-navy">{inr(totals.grossSales)}</p>
        </div>
        <div>
          <p className="text-xs text-charcoal/50 uppercase tracking-wide">Taxable</p>
          <p className="font-display text-xl text-deep-navy">{inr(totals.taxableSales)}</p>
        </div>
        <div>
          <p className="text-xs text-charcoal/50 uppercase tracking-wide">Net</p>
          <p className="font-display text-xl text-deep-navy">{inr(totals.netSales)}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-charcoal/45 border-b border-border">
              <th className="py-2 pr-3 font-medium">Order</th>
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Customer</th>
              <th className="py-2 pr-3 font-medium">State</th>
              <th className="py-2 pr-3 font-medium">Taxable</th>
              <th className="py-2 pr-3 font-medium">CGST</th>
              <th className="py-2 pr-3 font-medium">SGST</th>
              <th className="py-2 pr-3 font-medium">IGST</th>
              <th className="py-2 pr-3 font-medium">Tax OK</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-4 text-charcoal/50">
                  No valid INR sales in this period.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.orderId} className="border-b border-border/70">
                  <td className="py-2 pr-3 text-deep-navy">{row.orderNumber}</td>
                  <td className="py-2 pr-3 text-charcoal/70">
                    {row.orderDate.slice(0, 10)}
                  </td>
                  <td className="py-2 pr-3">{row.customerName ?? "—"}</td>
                  <td className="py-2 pr-3">{row.customerState ?? "—"}</td>
                  <td className="py-2 pr-3">{inr(row.taxableValue)}</td>
                  <td className="py-2 pr-3">{inr(row.cgst)}</td>
                  <td className="py-2 pr-3">{inr(row.sgst)}</td>
                  <td className="py-2 pr-3">{inr(row.igst)}</td>
                  <td className="py-2 pr-3">
                    {row.taxComplete ? "Yes" : "No"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

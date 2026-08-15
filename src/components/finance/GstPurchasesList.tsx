"use client";

import type { PurchaseBill, GstPurchaseTotals } from "@/lib/domain/gst-types";

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

export function GstPurchasesList({
  totals,
  bills,
}: {
  totals: GstPurchaseTotals;
  bills: PurchaseBill[];
}) {
  return (
    <div className="space-y-4" data-testid="gst-purchases">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-charcoal/50 uppercase tracking-wide">Bills</p>
          <p className="font-display text-xl text-deep-navy">{totals.billCount}</p>
        </div>
        <div>
          <p className="text-xs text-charcoal/50 uppercase tracking-wide">Taxable</p>
          <p className="font-display text-xl text-deep-navy">{inr(totals.taxablePurchases)}</p>
        </div>
        <div>
          <p className="text-xs text-charcoal/50 uppercase tracking-wide">Captured tax</p>
          <p className="font-display text-xl text-deep-navy">{inr(totals.capturedPurchaseTax)}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {bills.length === 0 ? (
          <li className="text-sm text-charcoal/50">No purchase bills in this period.</li>
        ) : (
          bills.map((b) => (
            <li
              key={b.id}
              className="border-b border-border py-2 text-sm flex flex-wrap gap-x-4 gap-y-1"
            >
              <span className="text-deep-navy font-medium">{b.invoiceNumber || "(no number)"}</span>
              <span>{b.vendorName}</span>
              <span className="text-charcoal/55">{b.invoiceDate ?? "no date"}</span>
              <span>{inr(b.invoiceTotal)}</span>
              <span className="text-charcoal/50">{b.reviewStatus}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

"use client";

import Link from "next/link";
import type { RetailerWeekRow, VendorWeekRow } from "@/lib/domain/operating-metrics-types";
import { StatusChip } from "@/components/ui/StatusChip";

export function RetailersWeekPanel({
  rows,
  completed,
  total,
}: {
  rows: RetailerWeekRow[];
  completed: number;
  total: number;
}) {
  const pending = rows.filter((r) => !r.transferredThisWeek);

  return (
    <section className="rounded-xl border border-border bg-white/80 p-4 space-y-3" data-testid="retailers-week">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-deep-navy">Retailers</h2>
          <p className="text-sm text-charcoal/55">
            Active partners visited/replenished this week (Transfer into partner location).
          </p>
        </div>
        <p className="text-sm text-deep-navy font-medium">
          {completed}/{total} completed
        </p>
      </div>
      {pending.length === 0 ? (
        <p className="text-sm text-charcoal/50">All active retailers visited this week.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-xl">
          {pending.map((r) => (
            <li key={r.partnerId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div>
                <p className="font-medium text-deep-navy">{r.partnerName}</p>
                <p className="text-xs text-charcoal/50">
                  {r.partnerType}
                  {r.lastTransferDate
                    ? ` · last transfer ${r.lastTransferDate}`
                    : " · no transfer yet"}
                </p>
              </div>
              <Link
                href="/inventory?tab=replenishment"
                className="text-sm text-aarla-red hover:underline"
              >
                Pending
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function VendorsWeekPanel({
  pending,
  completed,
}: {
  pending: VendorWeekRow[];
  completed: VendorWeekRow[];
}) {
  return (
    <section className="rounded-xl border border-border bg-white/80 p-4 space-y-3" data-testid="vendors-week">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-deep-navy">Vendors</h2>
          <p className="text-sm text-charcoal/55">
            Purchase orders needing action vs received this week.
          </p>
        </div>
        <p className="text-sm text-deep-navy font-medium">
          {completed.length} received · {pending.length} pending
        </p>
      </div>
      {pending.length === 0 ? (
        <p className="text-sm text-charcoal/50">No open purchase orders.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-xl">
          {pending.map((v) => (
            <li key={v.purchaseOrderId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-deep-navy truncate">
                  {v.vendorName} · {v.productTitle}
                </p>
                <p className="text-xs text-charcoal/50">
                  {v.purchaseOrderCode} · qty {v.quantityReceived}/{v.quantityOrdered}
                  {v.requiredDate ? ` · due ${v.requiredDate}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusChip label={v.status} tone="warning" />
                <Link href="/manufacture" className="text-sm text-aarla-red hover:underline">
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

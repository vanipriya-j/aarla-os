"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { listVendorOrdersAction } from "@/app/actions/manufacture-actions";
import type { VendorOrder } from "@/lib/domain/manufacture-types";

export default function ManufactureHistoryPage() {
  const [pending, startTransition] = useTransition();
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const r = await listVendorOrdersAction();
      if (!r.ok) setError(r.error);
      else setOrders(r.data.filter((o) => ["received", "closed", "partially_received"].includes(o.status)));
    });
  }, []);

  return (
    <>
      <Header
        title="Production history"
        subtitle="Completed batches — cost, delay, and (later) sell-through after receipt."
        actions={
          <Link href="/manufacture">
            <Button size="sm" variant="outline">
              Home
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-4 max-w-6xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {pending && !orders.length ? (
          <p className="text-sm text-charcoal/50">Loading…</p>
        ) : null}
        {orders.map((o) => (
          <Link
            key={o.orderNumber}
            href={`/manufacture/orders/${encodeURIComponent(o.orderNumber)}`}
            className="card-surface p-4 block hover:border-aarla-red/30"
          >
            <p className="font-medium text-deep-navy">{o.orderNumber}</p>
            <p className="text-sm text-charcoal/65 mt-1">
              Vendor {o.vendorId} · {o.items.map((i) => `${i.title} ×${i.quantity}`).join(", ")}
            </p>
            <p className="text-xs text-charcoal/50 mt-1">
              Committed {o.vendorCommittedDate ?? "—"} · Expected {o.internalExpectedDate ?? "—"} ·{" "}
              {o.pricingStatus === "pending" || o.total == null
                ? "PRICE PENDING"
                : `₹${o.total.toLocaleString("en-IN")}`}
            </p>
          </Link>
        ))}
        {!pending && !orders.length ? (
          <p className="text-sm text-charcoal/55">
            No completed production batches yet. History fills as orders are received via Receive
            Stock.
          </p>
        ) : null}
      </main>
    </>
  );
}

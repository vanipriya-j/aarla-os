"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import {
  getNeedsMakingAction,
  listVendorOrdersAction,
} from "@/app/actions/manufacture-actions";
import type { ProductionRequirement, VendorOrder } from "@/lib/domain/manufacture-types";
import { AlertTriangle, ArrowRight, Factory, Package } from "lucide-react";

type NeedsBoard = {
  persisted: ProductionRequirement[];
  fromInventory: Array<{
    productId: string;
    variantId: string | null;
    label: string;
    quantityToProduce: number;
    reason: string;
    available: number;
    kind: string;
  }>;
};

function daysOverdue(date: string | null): number | null {
  if (!date) return null;
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  return d > 0 ? d : null;
}

export default function ManufactureHomePage() {
  const [pending, startTransition] = useTransition();
  const [needs, setNeeds] = useState<NeedsBoard | null>(null);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    startTransition(async () => {
      setError(null);
      const [n, o] = await Promise.all([getNeedsMakingAction(), listVendorOrdersAction()]);
      if (!n.ok) setError(n.error);
      else setNeeds(n.data);
      if (!o.ok) setError(o.error);
      else setOrders(o.data);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const inProduction = orders.filter((o) =>
    ["confirmed", "in_production", "awaiting_payment", "awaiting_dispatch", "sent", "awaiting_confirmation"].includes(
      o.status,
    ),
  );
  const overdue = orders.filter((o) => {
    const d = daysOverdue(o.vendorCommittedDate);
    return d != null && d > 0 && !["received", "closed", "cancelled"].includes(o.status);
  });
  const awaiting = orders.filter((o) =>
    ["awaiting_confirmation", "awaiting_payment", "ready_to_receive", "draft", "ready_to_send"].includes(
      o.status,
    ),
  );

  return (
    <>
      <Header
        title="Manufacture / Reorder"
        subtitle="Need → vendor → structured order → PDF → send → execute → receive. The order in Aarla is the source of truth."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/manufacture/needs">
              <Button size="sm" variant="outline">
                Needs Making
              </Button>
            </Link>
            <Link href="/manufacture/orders">
              <Button size="sm" variant="outline">
                Orders
              </Button>
            </Link>
            <Link href="/manufacture/vendors">
              <Button size="sm" variant="primary">
                Vendors
              </Button>
            </Link>
          </div>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-8 max-w-6xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {pending && !needs ? <p className="text-sm text-charcoal/50">Loading…</p> : null}

        <div className="flex flex-wrap gap-2 text-sm">
          {[
            ["needs", "Needs", "/manufacture/needs"],
            ["orders", "Orders", "/manufacture/orders"],
            ["vendors", "Vendors", "/manufacture/vendors"],
            ["workflows", "Workflows", "/manufacture/workflows"],
            ["history", "History", "/manufacture/history"],
          ].map(([id, label, href]) => (
            <Link
              key={id}
              href={href}
              className="rounded-full border border-border bg-white px-3 py-1.5 text-charcoal/70 hover:border-aarla-red/40"
            >
              {label}
            </Link>
          ))}
        </div>

        <section className="space-y-3">
          <h2 className="font-display text-xl text-deep-navy flex items-center gap-2">
            <Package className="h-5 w-5" /> Needs Making
          </h2>
          <div className="space-y-3">
            {(needs?.fromInventory ?? []).slice(0, 5).map((n) => (
              <div key={`${n.productId}-${n.variantId}`} className="card-surface p-4 flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-medium text-deep-navy">{n.label}</p>
                  <p className="text-sm text-charcoal/65">
                    Required: {n.quantityToProduce} · ATP: {n.available} · {n.reason}
                  </p>
                </div>
                <Link href={`/manufacture/needs?make=${encodeURIComponent(n.productId)}&qty=${n.quantityToProduce}`}>
                  <Button size="sm">Make</Button>
                </Link>
              </div>
            ))}
            {(needs?.persisted ?? []).slice(0, 3).map((n) => (
              <div key={n.code} className="card-surface p-4 flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-medium text-deep-navy">{n.productId}{n.variantId ? ` / ${n.variantId}` : ""}</p>
                  <p className="text-sm text-charcoal/65">
                    Required: {n.quantityToProduce} · {n.reason}
                  </p>
                </div>
                <Link href={`/manufacture/needs?req=${encodeURIComponent(n.code)}`}>
                  <Button size="sm" variant="outline">
                    Open
                  </Button>
                </Link>
              </div>
            ))}
            {!needs?.fromInventory.length && !needs?.persisted.length ? (
              <p className="text-sm text-charcoal/55">No open manufacturing needs right now.</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl text-deep-navy flex items-center gap-2">
            <Factory className="h-5 w-5" /> In Production
          </h2>
          <div className="space-y-3">
            {inProduction.slice(0, 6).map((o) => (
              <Link
                key={o.orderNumber}
                href={`/manufacture/orders/${encodeURIComponent(o.orderNumber)}`}
                className="card-surface p-4 block hover:border-aarla-red/30"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium text-deep-navy">{o.orderNumber}</p>
                  <span className="text-xs uppercase tracking-wide text-charcoal/50">{o.status.replaceAll("_", " ")}</span>
                </div>
                <p className="text-sm text-charcoal/65 mt-1">
                  Vendor: {o.vendorId} · Committed: {o.vendorCommittedDate ?? "—"} · Internal:{" "}
                  {o.internalExpectedDate ?? "—"}
                </p>
              </Link>
            ))}
            {!inProduction.length ? (
              <p className="text-sm text-charcoal/55">No open vendor orders.</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl text-deep-navy flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-aarla-red" /> Overdue
          </h2>
          <div className="space-y-3">
            {overdue.map((o) => (
              <Link
                key={o.orderNumber}
                href={`/manufacture/orders/${encodeURIComponent(o.orderNumber)}`}
                className="card-surface p-4 block border-aarla-red/30"
              >
                <p className="font-medium text-deep-navy">{o.orderNumber}</p>
                <p className="text-sm text-aarla-red">
                  Vendor committed {o.vendorCommittedDate} · overdue {daysOverdue(o.vendorCommittedDate)} days
                </p>
              </Link>
            ))}
            {!overdue.length ? <p className="text-sm text-charcoal/55">Nothing overdue.</p> : null}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl text-deep-navy">Awaiting Action</h2>
          <div className="space-y-2">
            {awaiting.slice(0, 8).map((o) => (
              <Link
                key={o.orderNumber}
                href={`/manufacture/orders/${encodeURIComponent(o.orderNumber)}`}
                className="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-sm hover:border-aarla-red/40"
              >
                <span className="text-deep-navy font-medium">{o.orderNumber}</span>
                <span className="text-charcoal/55 flex items-center gap-1">
                  {o.status.replaceAll("_", " ")} <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
            {!awaiting.length ? <p className="text-sm text-charcoal/55">No actions waiting.</p> : null}
          </div>
        </section>
      </main>
    </>
  );
}

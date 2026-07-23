"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  batches,
  getInventorySnapshots,
  getLocationName,
  getProductTitle,
  locations,
  networkProducts,
  networkVendors,
  stockMovements,
} from "@/lib/network-data";

type Tab = "products" | "locations" | "batches" | "movements";

function InventoryInner() {
  const searchParams = useSearchParams();
  const initial = (searchParams.get("tab") as Tab) || "products";
  const [tab, setTab] = useState<Tab>(initial);
  const snapshots = useMemo(() => getInventorySnapshots(), []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "products", label: "Products" },
    { id: "locations", label: "Locations" },
    { id: "batches", label: "Batches" },
    { id: "movements", label: "Movement Ledger" },
  ];

  return (
    <>
      <Header
        title="Inventory"
        subtitle="Stock derived from movements across studio, partners and channels."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`text-sm rounded-full px-3 py-1.5 border transition ${
                tab === t.id
                  ? "bg-aarla-red text-white border-aarla-red"
                  : "border-border bg-white text-charcoal/70 hover:border-aarla-red/40"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "products" ? (
          <DataTable
            rows={snapshots}
            rowKey={(r) => r.productId}
            columns={[
              {
                key: "product",
                header: "Product",
                render: (r) => (
                  <Link
                    href={`/products/${r.productId}`}
                    className="font-medium text-deep-navy hover:text-aarla-red"
                  >
                    {getProductTitle(r.productId)}
                  </Link>
                ),
              },
              { key: "studio", header: "Studio Stock", render: (r) => String(r.studioStock) },
              { key: "partner", header: "Partner Stock", render: (r) => String(r.partnerStock) },
              { key: "reserved", header: "Reserved", render: (r) => String(r.reserved) },
              { key: "damaged", header: "Damaged", render: (r) => String(r.damaged) },
              {
                key: "available",
                header: "Available",
                render: (r) => (
                  <StatusChip label={String(r.available)} tone={r.available ? "success" : "warning"} />
                ),
              },
            ]}
          />
        ) : null}

        {tab === "locations" ? (
          <div className="grid md:grid-cols-2 gap-4">
            {locations
              .filter((l) => !["loc-vendor", "loc-customer", "loc-damage"].includes(l.id))
              .map((loc) => {
                const inbound = stockMovements.filter((m) => m.toLocationId === loc.id);
                const units = inbound.reduce((s, m) => s + m.quantity, 0);
                return (
                  <div key={loc.id} className="card-surface p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-xl text-deep-navy">{loc.name}</h3>
                        <p className="text-xs text-charcoal/55 mt-1">{loc.kind}</p>
                      </div>
                      <StatusChip label={`${units} moved in`} tone="info" />
                    </div>
                    {loc.partnerId ? (
                      <Link
                        href="/partners"
                        className="inline-block mt-3 text-sm text-aarla-red font-medium"
                      >
                        Open partner →
                      </Link>
                    ) : null}
                  </div>
                );
              })}
          </div>
        ) : null}

        {tab === "batches" ? (
          <DataTable
            rows={batches}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "batch",
                header: "Batch",
                render: (r) => <span className="font-medium text-deep-navy">{r.batchNumber}</span>,
              },
              {
                key: "product",
                header: "Product",
                render: (r) => (
                  <Link href={`/products/${r.productId}`} className="hover:text-aarla-red">
                    {getProductTitle(r.productId)}
                  </Link>
                ),
              },
              {
                key: "vendor",
                header: "Vendor",
                render: (r) => networkVendors.find((v) => v.id === r.vendorId)?.company ?? "—",
              },
              { key: "mfg", header: "Manufactured", render: (r) => r.manufactureDate },
              { key: "recv", header: "Received", render: (r) => r.receivedDate },
              { key: "qty", header: "Produced", render: (r) => String(r.quantityProduced) },
              { key: "ok", header: "Accepted", render: (r) => String(r.accepted) },
              {
                key: "dmg",
                header: "Damaged",
                render: (r) => (
                  <StatusChip label={String(r.damaged)} tone={r.damaged ? "danger" : "success"} />
                ),
              },
            ]}
          />
        ) : null}

        {tab === "movements" ? (
          <DataTable
            rows={[...stockMovements].sort((a, b) => b.date.localeCompare(a.date))}
            rowKey={(r) => r.id}
            columns={[
              { key: "date", header: "Date", render: (r) => r.date },
              {
                key: "product",
                header: "Product",
                render: (r) => (
                  <Link href={`/products/${r.productId}`} className="hover:text-aarla-red">
                    {getProductTitle(r.productId)}
                  </Link>
                ),
              },
              {
                key: "batch",
                header: "Batch",
                render: (r) => batches.find((b) => b.id === r.batchId)?.batchNumber ?? "—",
              },
              { key: "qty", header: "Qty", render: (r) => String(r.quantity) },
              {
                key: "from",
                header: "From",
                render: (r) => getLocationName(r.fromLocationId),
              },
              {
                key: "to",
                header: "To",
                render: (r) => getLocationName(r.toLocationId),
              },
              {
                key: "type",
                header: "Type",
                render: (r) => <StatusChip label={r.movementType} tone="info" />,
              },
              { key: "ref", header: "Reference", render: (r) => r.reference },
            ]}
          />
        ) : null}

        {tab === "products" ? (
          <div className="card-surface-pale p-4 text-sm text-charcoal/65">
            Tip: open{" "}
            <Link href="/products/np-kolam" className="text-aarla-red font-medium">
              Kolam Bottle
            </Link>{" "}
            for the full journey and traceability experience.
            <span className="text-charcoal/40"> · {networkProducts.length} network products</span>
          </div>
        ) : null}
      </main>
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<Header title="Inventory" subtitle="Loading…" />}>
      <InventoryInner />
    </Suspense>
  );
}

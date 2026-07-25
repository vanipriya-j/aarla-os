"use client";

import { useAppLedger } from "@/lib/client/use-app-data";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";

type Tab = "products" | "locations" | "batches" | "movements";

function InventoryInner() {
  const searchParams = useSearchParams();
  const initial = (searchParams.get("tab") as Tab) || "products";
  const [tab, setTab] = useState<Tab>(initial);
  const {
    snapshots,
    movements,
    hydrated,
    error,
    products,
    locations,
    batches,
    vendors,
  } = useAppLedger();

  const productTitle = (id: string) => products.find((p) => p.id === id)?.title ?? id;
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;

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
        subtitle="Balances are derived from the Stock Movement Ledger — the single source of truth."
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

        {!hydrated ? (
          <p className="text-sm text-charcoal/50">Loading ledger…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-aarla-red">{error}</p>
        ) : null}

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
                    {productTitle(r.productId)}
                  </Link>
                ),
              },
              { key: "studio", header: "Studio Stock", render: (r) => String(r.studioStock) },
              { key: "partner", header: "Partner Stock", render: (r) => String(r.partnerStock) },
              { key: "channel", header: "Shopify Pool", render: (r) => String(r.channelStock) },
              { key: "reserved", header: "Reserved", render: (r) => String(r.reserved) },
              { key: "damaged", header: "Damaged", render: (r) => String(r.damaged) },
              {
                key: "available",
                header: "Available",
                render: (r) => (
                  <StatusChip
                    label={String(r.available)}
                    tone={r.available ? "success" : "warning"}
                  />
                ),
              },
            ]}
          />
        ) : null}

        {tab === "locations" ? (
          <div className="grid md:grid-cols-2 gap-4">
            {locations
              .filter((l) => !["loc-external", "loc-sold"].includes(l.id))
              .map((loc) => {
                const inbound = movements.filter((m) => m.toLocationId === loc.id);
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
                render: (r) => (
                  <span className="font-medium text-deep-navy">{r.batchNumber}</span>
                ),
              },
              {
                key: "product",
                header: "Product",
                render: (r) => (
                  <Link href={`/products/${r.productId}`} className="hover:text-aarla-red">
                    {productTitle(r.productId)}
                  </Link>
                ),
              },
              {
                key: "vendor",
                header: "Vendor",
                render: (r) => vendorName(r.vendorId),
              },
              { key: "mfg", header: "Manufactured", render: (r) => r.manufactureDate },
              { key: "recv", header: "Received", render: (r) => r.receivedDate || "—" },
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
            rows={[...movements].sort((a, b) => b.date.localeCompare(a.date))}
            rowKey={(r) => r.id}
            columns={[
              { key: "date", header: "Date", render: (r) => r.date },
              {
                key: "product",
                header: "Product",
                render: (r) => (
                  <Link href={`/products/${r.productId}`} className="hover:text-aarla-red">
                    {productTitle(r.productId)}
                  </Link>
                ),
              },
              {
                key: "batch",
                header: "Batch",
                render: (r) =>
                  batches.find((b) => b.id === r.batchId)?.batchNumber ?? "—",
              },
              { key: "qty", header: "Qty", render: (r) => String(r.quantity) },
              {
                key: "from",
                header: "From",
                render: (r) => locationName(r.fromLocationId),
              },
              {
                key: "to",
                header: "To",
                render: (r) => locationName(r.toLocationId),
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
            Signature journey:{" "}
            <Link href="/products/prod-kolam-bottle" className="text-aarla-red font-medium">
              Kolam Bottle →
            </Link>
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

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { JourneyTimeline } from "@/components/network/JourneyTimeline";
import { TraceabilityDiagram } from "@/components/network/TraceabilityDiagram";
import {
  batches,
  buildProductJourney,
  getInventorySnapshots,
  getPersonName,
  networkProducts,
  networkVendors,
  partners,
  registrationsSeed,
  stockMovements,
} from "@/lib/network-data";
import { ArrowLeft } from "lucide-react";

type Tab = "overview" | "journey" | "traceability" | "movements" | "registrations";

export default function ProductDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const product = networkProducts.find((p) => p.id === id);
  const [tab, setTab] = useState<Tab>("journey");

  const batch = batches.find((b) => b.productId === id);
  const vendor = batch ? networkVendors.find((v) => v.id === batch.vendorId) : undefined;
  const snapshot = getInventorySnapshots().find((s) => s.productId === id);
  const moves = stockMovements.filter((m) => m.productId === id);
  const regs = registrationsSeed.filter((r) => r.productId === id);
  const journey = useMemo(() => buildProductJourney(id), [id]);
  const partnerNames = partners
    .filter((p) => p.currentInventory.some((i) => i.productId === id && i.quantity > 0))
    .map((p) => p.name);

  if (!product) {
    return (
      <>
        <Header title="Product not found" />
        <main className="px-8 py-8">
          <Link href="/inventory">
            <Button variant="outline">Back to Inventory</Button>
          </Link>
        </main>
      </>
    );
  }

  const soldEstimate =
    product.id === "np-welcome-kit" ? 500 : moves.filter((m) => m.movementType.includes("Sale") || m.movementType === "Gift" || m.movementType === "Corporate Allocation").reduce((s, m) => s + m.quantity, 0);
  const unknown = Math.max(soldEstimate - regs.length, 0);
  const regRate = soldEstimate ? Math.round((regs.length / soldEstimate) * 100) : 0;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "journey", label: "Journey" },
    { id: "traceability", label: "Traceability" },
    { id: "movements", label: "Movements" },
    { id: "registrations", label: "Registrations" },
  ];

  return (
    <>
      <Header
        title={product.title}
        subtitle={`${product.world} · ${product.sku} · ${product.story}`}
        actions={
          <Link href="/inventory">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Inventory
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-5xl">
        <div className="card-surface p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <StatusChip
              label={product.currentLifecycleStatus}
              tone={statusToneFromLabel(product.currentLifecycleStatus)}
            />
            <StatusChip label={`${regs.length} registrations`} tone="success" />
            <StatusChip label={`${snapshot?.available ?? 0} available`} tone="info" />
          </div>
          <Link href="/register">
            <Button size="sm">Register this product</Button>
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`text-sm rounded-full px-3 py-1.5 border transition ${
                tab === t.id
                  ? "bg-aarla-red text-white border-aarla-red"
                  : "border-border bg-white text-charcoal/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="space-y-4 animate-fade-up">
            <section className="card-surface p-5 grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-charcoal/50 text-xs uppercase tracking-wider">Idea origin</p>
                <p className="mt-1 text-deep-navy">{product.ideaOrigin}</p>
              </div>
              <div>
                <p className="text-charcoal/50 text-xs uppercase tracking-wider">Vendor</p>
                <p className="mt-1 text-deep-navy">{vendor?.company ?? "—"}</p>
              </div>
              <div>
                <p className="text-charcoal/50 text-xs uppercase tracking-wider">Batch</p>
                <p className="mt-1 text-deep-navy">{batch?.batchNumber ?? "—"}</p>
              </div>
              <div>
                <p className="text-charcoal/50 text-xs uppercase tracking-wider">Received</p>
                <p className="mt-1 text-deep-navy">
                  {batch
                    ? `${batch.receivedDate} · ${batch.accepted} accepted · ${batch.damaged} damaged`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-charcoal/50 text-xs uppercase tracking-wider">Partner stock</p>
                <p className="mt-1 text-deep-navy">
                  {partnerNames.length ? partnerNames.join(", ") : "None"}
                </p>
              </div>
              <div>
                <p className="text-charcoal/50 text-xs uppercase tracking-wider">Circulation</p>
                <p className="mt-1 text-deep-navy">
                  {unknown
                    ? `${unknown} In Circulation – User Unknown`
                    : "Users known via registration"}
                </p>
              </div>
            </section>
            <section className="card-surface p-5">
              <h3 className="font-display text-lg text-deep-navy mb-3">Variants</h3>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <StatusChip key={v.id} label={`${v.label} · ${v.sku}`} />
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "journey" ? (
          <div className="card-surface p-6 md:p-8 animate-fade-up">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-aarla-red mb-2">
              Product Journey
            </p>
            <h2 className="font-display text-3xl text-deep-navy mb-6">{product.title}</h2>
            <JourneyTimeline stages={journey} />
          </div>
        ) : null}

        {tab === "traceability" ? (
          <div className="animate-fade-up">
            <TraceabilityDiagram
              productTitle={product.title}
              vendorName={vendor?.company ?? "—"}
              batchNumber={batch?.batchNumber ?? "—"}
              partnerNames={partnerNames}
              registrationRate={regRate}
              unknownInCirculation={unknown}
            />
          </div>
        ) : null}

        {tab === "movements" ? (
          <ul className="card-surface divide-y divide-border animate-fade-up">
            {moves.map((m) => (
              <li key={m.id} className="px-5 py-4 text-sm flex flex-wrap justify-between gap-2">
                <span>
                  <span className="font-medium text-deep-navy">{m.date}</span> · {m.movementType} · ×
                  {m.quantity}
                  <span className="text-charcoal/55"> — {m.notes}</span>
                </span>
                <StatusChip label={m.reference} tone="neutral" />
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "registrations" ? (
          <ul className="card-surface divide-y divide-border animate-fade-up">
            {regs.map((r) => (
              <li key={r.registrationId} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-deep-navy">{r.registrationCode}</span>
                  <StatusChip label={r.status} tone="success" />
                </div>
                <p className="mt-1 text-charcoal/65">
                  {r.registrationDate} · User {getPersonName(r.userId)}
                  {r.customerId ? ` · Customer ${getPersonName(r.customerId)}` : ""}
                  {r.customerId && r.userId !== r.customerId ? " (Customer ≠ User)" : ""}
                </p>
              </li>
            ))}
            {!regs.length ? (
              <li className="px-5 py-8 text-center text-charcoal/50">No registrations yet</li>
            ) : null}
          </ul>
        ) : null}
      </main>
    </>
  );
}

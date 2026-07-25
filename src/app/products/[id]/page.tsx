"use client";

import { useAppLedger, useAppNetwork } from "@/lib/client/use-app-data";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { JourneyTimeline } from "@/components/network/JourneyTimeline";
import { TraceabilityDiagram } from "@/components/network/TraceabilityDiagram";
import { projectProductJourney } from "@/lib/domain/journey";
import { ArrowLeft } from "lucide-react";

type Tab = "overview" | "journey" | "traceability" | "movements" | "registrations";

export default function ProductDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [tab, setTab] = useState<Tab>("journey");
  const { movements, snapshots, products, batches, vendors, partners, hydrated } = useAppLedger();
  const { people, registrations } = useAppNetwork();

  const product = products.find((p) => p.id === id);
  const getPersonName = (pid: string) => people.find((p) => p.id === pid)?.name ?? pid;
  const getVendorName = (vid: string) => vendors.find((v) => v.id === vid)?.name ?? vid;

  const batch =
    batches.find((b) => b.productId === id && b.accepted > 0) ??
    batches.find((b) => b.productId === id);
  const vendor = batch ? getVendorName(batch.vendorId) : "—";
  const snapshot = snapshots.find((s) => s.productId === id);
  const moves = movements.filter((m) => m.productId === id);
  const regs = registrations.filter((r) => r.productId === id);
  const journey = useMemo(
    () => projectProductJourney(id, movements, registrations),
    [id, movements, registrations],
  );
  const partnerNames = partners
    .filter((p) =>
      moves.some(
        (m) =>
          m.movementType === "Transfer" &&
          m.toLocationId.includes(p.id.replace("partner-", "")),
      ),
    )
    .map((p) => p.name);

  if (hydrated && !product) {
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

  if (!product) {
    return <Header title="Product" subtitle="Loading…" />;
  }

  const soldEstimate = moves
    .filter((m) =>
      ["Shopify Sale", "Partner Sale", "Studio Sale", "Gift", "Corporate Allocation"].includes(
        m.movementType,
      ),
    )
    .reduce((s, m) => s + m.quantity, 0);
  const unknown = Math.max(soldEstimate - regs.length, 0);
  const regRate = soldEstimate ? Math.round((regs.length / soldEstimate) * 100) : 0;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "journey", label: "Journey" },
    { id: "traceability", label: "Traceability" },
    { id: "movements", label: "Movements" },
    { id: "registrations", label: "Registrations" },
  ];

  const lifecycle =
    unknown > 0 && soldEstimate > 0
      ? "In Circulation – User Unknown"
      : regs.length
        ? "Registered"
        : snapshot && snapshot.totalOnHand > 0
          ? "In Inventory"
          : "Designed";

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
            <StatusChip label={lifecycle} tone={statusToneFromLabel(lifecycle)} />
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
          <section className="card-surface p-5 grid sm:grid-cols-2 gap-4 text-sm animate-fade-up">
            <div>
              <p className="text-charcoal/50 text-xs uppercase tracking-wider">Idea origin</p>
              <p className="mt-1 text-deep-navy">{product.ideaOrigin ?? "—"}</p>
            </div>
            <div>
              <p className="text-charcoal/50 text-xs uppercase tracking-wider">Vendor</p>
              <p className="mt-1 text-deep-navy">{vendor}</p>
            </div>
            <div>
              <p className="text-charcoal/50 text-xs uppercase tracking-wider">Batch</p>
              <p className="mt-1 text-deep-navy">{batch?.batchNumber ?? "—"}</p>
            </div>
            <div>
              <p className="text-charcoal/50 text-xs uppercase tracking-wider">Ledger balances</p>
              <p className="mt-1 text-deep-navy">
                Studio {snapshot?.studioStock ?? 0} · Partner {snapshot?.partnerStock ?? 0} ·
                Channel {snapshot?.channelStock ?? 0} · Damaged {snapshot?.damaged ?? 0}
              </p>
            </div>
          </section>
        ) : null}

        {tab === "journey" ? (
          <div className="card-surface p-6 md:p-8 animate-fade-up">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-aarla-red mb-2">
              Product Journey
            </p>
            <h2 className="font-display text-3xl text-deep-navy mb-2">{product.title}</h2>
            <p className="text-sm text-charcoal/55 mb-6">Projected from the stock ledger + registrations.</p>
            <JourneyTimeline stages={journey} />
          </div>
        ) : null}

        {tab === "traceability" ? (
          <div className="animate-fade-up">
            <TraceabilityDiagram
              productTitle={product.title}
              vendorName={vendor}
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

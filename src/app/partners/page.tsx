"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { partners, getProductTitle, stockMovements, registrationsSeed } from "@/lib/network-data";
import { Package, ScanLine, Store, ShoppingBag } from "lucide-react";

export default function PartnersPage() {
  const [selectedId, setSelectedId] = useState(partners[0]?.id);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<"transfer" | "sale" | "payment" | null>(null);
  const selected = partners.find((p) => p.id === selectedId) ?? partners[0];

  const totalPartnerInventory = partners.reduce(
    (sum, p) => sum + p.currentInventory.reduce((s, i) => s + i.quantity, 0),
    0,
  );
  const totalRegs = partners.reduce((sum, p) => sum + p.registeredUsersOriginatingHere, 0);
  const totalSold = partners.reduce((sum, p) => sum + p.productsSold, 0);

  const partnerMoves = stockMovements.filter(
    (m) =>
      m.toLocationId.includes(selected.id.replace("pt-", "")) ||
      m.fromLocationId.includes(selected.id.replace("pt-", "")) ||
      (selected.id === "pt-freshly" &&
        (m.toLocationId === "loc-freshly" || m.fromLocationId === "loc-freshly")) ||
      (selected.id === "pt-nimalli" &&
        (m.toLocationId === "loc-nimalli" || m.fromLocationId === "loc-nimalli")) ||
      (selected.id === "pt-ngs" && (m.toLocationId === "loc-ngs" || m.fromLocationId === "loc-ngs")),
  );

  const partnerRegs = registrationsSeed.filter((r) => r.partnerId === selected.id);
  const invUnits = selected.currentInventory.reduce((s, i) => s + i.quantity, 0);
  const regPct =
    selected.productsSold > 0
      ? Math.round((selected.registeredUsersOriginatingHere / selected.productsSold) * 100)
      : 0;

  const simulate = (msg: string) => {
    setModal(null);
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <>
      <Header
        title="Partners"
        subtitle="Retail, café and studio partners who carry Aarla into the world."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {toast ? (
          <div className="rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
            {toast}
          </div>
        ) : null}

        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <SummaryCard label="Active Partners" value={String(partners.length)} icon={Store} />
          <SummaryCard label="Partner Inventory" value={String(totalPartnerInventory)} icon={Package} accent="navy" />
          <SummaryCard label="Registrations" value={String(totalRegs)} icon={ScanLine} accent="green" />
          <SummaryCard label="Products Sold" value={String(totalSold)} icon={ShoppingBag} accent="orange" />
        </section>

        <div className="grid lg:grid-cols-[260px_1fr] gap-4">
          <aside className="card-surface p-3 space-y-2 h-fit">
            {partners.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left rounded-xl px-3 py-3 border transition ${
                  selected.id === p.id
                    ? "border-aarla-red bg-aarla-red/5"
                    : "border-transparent hover:bg-pale-cream"
                }`}
              >
                <p className="text-sm font-medium text-deep-navy">{p.name}</p>
                <p className="text-xs text-charcoal/55 mt-1">
                  {p.partnerType} · {p.location}
                </p>
              </button>
            ))}
          </aside>

          <div className="space-y-4">
            <div className="card-surface p-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-deep-navy">{selected.name}</h2>
                <p className="text-sm text-charcoal/60 mt-1">
                  {selected.partnerType} · {selected.location} · {selected.contact}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusChip
                    label={selected.paymentStatus}
                    tone={statusToneFromLabel(selected.paymentStatus)}
                  />
                  <StatusChip label={`${selected.margin}% margin`} tone="info" />
                  <StatusChip label={`${regPct}% registration`} tone="success" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setModal("transfer")}>
                  Transfer Stock
                </Button>
                <Button size="sm" variant="outline" onClick={() => setModal("sale")}>
                  Record Sale
                </Button>
                <Button size="sm" onClick={() => setModal("payment")}>
                  Record Payment
                </Button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <section className="card-surface p-5">
                <h3 className="font-display text-lg text-deep-navy mb-3">Inventory</h3>
                <ul className="space-y-2">
                  {selected.currentInventory.map((i) => (
                    <li
                      key={i.productId}
                      className="flex justify-between text-sm border-b border-border pb-2"
                    >
                      <Link
                        href={`/products/${i.productId}`}
                        className="text-deep-navy hover:text-aarla-red"
                      >
                        {getProductTitle(i.productId)}
                      </Link>
                      <span className="font-medium">{i.quantity}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-charcoal/50 mt-3">{invUnits} units on hand</p>
              </section>

              <section className="card-surface p-5">
                <h3 className="font-display text-lg text-deep-navy mb-3">Merchandising</h3>
                <p className="text-sm text-charcoal/70 leading-relaxed">{selected.merchandisingNotes}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.displayPhotos.length ? (
                    selected.displayPhotos.map((ph) => <StatusChip key={ph} label={ph} />)
                  ) : (
                    <StatusChip label="No display photos" tone="warning" />
                  )}
                </div>
              </section>
            </div>

            <section className="card-surface p-5">
              <h3 className="font-display text-lg text-deep-navy mb-3">Stock movement</h3>
              <ul className="space-y-2 text-sm">
                {partnerMoves.length ? (
                  partnerMoves.map((m) => (
                    <li key={m.id} className="flex justify-between gap-3 border-b border-border pb-2">
                      <span>
                        {m.date} · {m.movementType} · {getProductTitle(m.productId)} ×{m.quantity}
                      </span>
                      <span className="text-charcoal/50">{m.reference}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-charcoal/50">No linked movements in mock ledger</li>
                )}
              </ul>
            </section>

            <div className="grid md:grid-cols-2 gap-4">
              <section className="card-surface p-5">
                <h3 className="font-display text-lg text-deep-navy mb-3">Sales & payments</h3>
                <p className="text-sm text-charcoal/70">
                  Products sold: <strong>{selected.productsSold}</strong>
                </p>
                <p className="text-sm text-charcoal/70 mt-1">
                  Payment status: <strong>{selected.paymentStatus}</strong>
                </p>
                <h4 className="text-sm font-medium text-deep-navy mt-4 mb-2">Replenishment</h4>
                <ul className="space-y-1 text-sm text-charcoal/70">
                  {selected.replenishmentHistory.map((r, i) => (
                    <li key={`${r.date}-${i}`}>
                      {r.date} · {getProductTitle(r.productId)} ×{r.quantity} — {r.note}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card-surface p-5">
                <h3 className="font-display text-lg text-deep-navy mb-3">Registered users</h3>
                <p className="font-display text-3xl text-aarla-red">
                  {selected.registeredUsersOriginatingHere}
                </p>
                <p className="text-sm text-charcoal/60 mt-1">
                  Registration rate {regPct}% of partner sales
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {partnerRegs.map((r) => (
                    <li key={r.registrationId}>
                      <Link href="/registrations" className="text-deep-navy hover:text-aarla-red">
                        {r.registrationCode}
                      </Link>{" "}
                      · {getProductTitle(r.productId)}
                    </li>
                  ))}
                  {!partnerRegs.length ? (
                    <li className="text-charcoal/50">No registrations attributed yet</li>
                  ) : null}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={
          modal === "transfer"
            ? "Transfer Stock"
            : modal === "sale"
              ? "Record Sale"
              : "Record Payment"
        }
        footer={
          <Button
            onClick={() =>
              simulate(
                modal === "transfer"
                  ? "Stock transfer recorded (simulated)."
                  : modal === "sale"
                    ? "Partner sale recorded (simulated)."
                    : "Payment recorded (simulated).",
              )
            }
          >
            Confirm
          </Button>
        }
      >
        <p className="text-sm text-charcoal/70">
          Demo action for <strong>{selected.name}</strong>. In a later version this will create a
          real stock movement and payment ledger entry.
        </p>
      </Modal>
    </>
  );
}

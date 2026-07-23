"use client";

import { useLedger } from "@/lib/domain/use-ledger";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, inputClass, selectClass } from "@/components/ui/FormSection";
import {
  getProductTitle,
  partnerStockFor,
  partners,
  products,
  registrationsSeed,
  } from "@/lib/domain";
import { Package, ScanLine, Store, ShoppingBag } from "lucide-react";

export default function PartnersPage() {
  const { movements, transfer, partnerSale } = useLedger();
  const [selectedId, setSelectedId] = useState(partners[0]?.id);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<"transfer" | "sale" | "payment" | null>(null);
  const [xferProduct, setXferProduct] = useState("prod-kolam-bottle");
  const [xferQty, setXferQty] = useState(5);
  const selected = partners.find((p) => p.id === selectedId) ?? partners[0];

  const inventory = useMemo(
    () => partnerStockFor(movements, selected.id),
    [movements, selected.id],
  );

  const totalPartnerInventory = partners.reduce(
    (sum, p) => sum + partnerStockFor(movements, p.id).reduce((s, i) => s + i.quantity, 0),
    0,
  );

  const partnerRegs = registrationsSeed.filter((r) => r.partnerId === selected.id);
  const totalRegs = partners.reduce(
    (sum, p) => sum + registrationsSeed.filter((r) => r.partnerId === p.id).length,
    0,
  );
  const totalSold = partners.reduce((sum, p) => sum + p.productsSold, 0);
  const invUnits = inventory.reduce((s, i) => s + i.quantity, 0);
  const regPct =
    selected.productsSold > 0
      ? Math.round((partnerRegs.length / selected.productsSold) * 100)
      : 0;

  const partnerMoves = movements.filter((m) => {
    const locHint = selected.id.replace("partner-", "");
    return (
      m.toLocationId.includes(locHint) ||
      m.fromLocationId.includes(locHint) ||
      m.notes.toLowerCase().includes(selected.name.toLowerCase())
    );
  });

  const confirmModal = () => {
    if (modal === "transfer") {
      const mv = transfer({
        productId: xferProduct,
        partnerId: selected.id,
        quantity: xferQty,
      });
      setToast(
        mv
          ? `Transfer posted to ledger: ${getProductTitle(xferProduct)} ×${xferQty} → ${selected.name}`
          : "Transfer failed — check studio available stock.",
      );
    } else if (modal === "sale") {
      const mv = partnerSale({
        productId: xferProduct,
        partnerId: selected.id,
        quantity: Math.min(xferQty, 1),
      });
      setToast(
        mv
          ? `Partner sale posted to ledger for ${selected.name}.`
          : "Sale failed — partner location has insufficient stock.",
      );
    } else {
      setToast("Payment recorded (metadata only — not a stock movement).");
    }
    setModal(null);
    setTimeout(() => setToast(null), 2800);
  };

  return (
    <>
      <Header
        title="Partners"
        subtitle="Partner stock is derived from the ledger via partner locations."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {toast ? (
          <div className="rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
            {toast}
          </div>
        ) : null}

        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <SummaryCard label="Active Partners" value={String(partners.length)} icon={Store} />
          <SummaryCard
            label="Partner Inventory"
            value={String(totalPartnerInventory)}
            icon={Package}
            accent="navy"
          />
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
                  {selected.partnerType} · {selected.location}
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
                <h3 className="font-display text-lg text-deep-navy mb-3">Inventory (from ledger)</h3>
                <ul className="space-y-2">
                  {inventory.length ? (
                    inventory.map((i) => (
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
                    ))
                  ) : (
                    <li className="text-sm text-charcoal/50">No stock at this location</li>
                  )}
                </ul>
                <p className="text-xs text-charcoal/50 mt-3">{invUnits} units on hand</p>
              </section>

              <section className="card-surface p-5">
                <h3 className="font-display text-lg text-deep-navy mb-3">Merchandising</h3>
                <p className="text-sm text-charcoal/70 leading-relaxed">{selected.merchandisingNotes}</p>
              </section>
            </div>

            <section className="card-surface p-5">
              <h3 className="font-display text-lg text-deep-navy mb-3">Stock movement</h3>
              <ul className="space-y-2 text-sm">
                {partnerMoves.slice(0, 12).map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 border-b border-border pb-2">
                    <span>
                      {m.date} · {m.movementType} · {getProductTitle(m.productId)} ×{m.quantity}
                    </span>
                    <span className="text-charcoal/50">{m.reference}</span>
                  </li>
                ))}
                {!partnerMoves.length ? (
                  <li className="text-charcoal/50">No linked movements yet</li>
                ) : null}
              </ul>
            </section>
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
        footer={<Button onClick={confirmModal}>Confirm</Button>}
      >
        {modal === "payment" ? (
          <p className="text-sm text-charcoal/70">
            Payment status is partner metadata (not a stock movement).
          </p>
        ) : (
          <div className="space-y-3">
            <Field label="Product">
              <select
                className={selectClass}
                value={xferProduct}
                onChange={(e) => setXferProduct(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity">
              <input
                className={inputClass}
                type="number"
                min={1}
                value={xferQty}
                onChange={(e) => setXferQty(Number(e.target.value))}
              />
            </Field>
            <p className="text-xs text-charcoal/55">
              {modal === "transfer"
                ? "Writes a Transfer movement: Studio → Partner location."
                : "Writes a Partner Sale movement: Partner location → Sold."}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

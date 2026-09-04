"use client";

import { useAppLedger, useAppNetwork } from "@/lib/client/use-app-data";
import { partnerStockFor } from "@/lib/domain/ledger";
import type { PartnerType, Product } from "@/lib/domain/types";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/FormSection";
import { Package, Plus, ScanLine, Store, ShoppingBag } from "lucide-react";

const PARTNER_TYPES: PartnerType[] = [
  "Retail Partner",
  "Reseller",
  "Pop-up",
  "Café",
  "Event",
  "Distributor",
];

type ModalKind = "create" | "transfer" | "legacy" | "sale" | "payment" | null;

function firstVariantId(product: Product | undefined): string {
  return product?.variants[0]?.id ?? "";
}

export default function PartnersPage() {
  const {
    movements,
    transfer,
    partnerSale,
    createPartner,
    establishPartnerOpeningBalances,
    partners,
    products,
    locations,
    hydrated,
    error,
  } = useAppLedger();
  const { registrations } = useAppNetwork();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);

  const [xferProduct, setXferProduct] = useState(products[0]?.id ?? "prod-kolam-bottle");
  const [xferVariant, setXferVariant] = useState("");
  const [xferQty, setXferQty] = useState(5);
  const [xferNotes, setXferNotes] = useState("");

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PartnerType>("Retail Partner");
  const [newLocation, setNewLocation] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newMargin, setNewMargin] = useState(0);
  const [newNotes, setNewNotes] = useState("");

  const selected =
    partners.find((p) => p.id === (selectedId ?? partners[0]?.id)) ?? partners[0];

  const selectedProduct =
    products.find((p) => p.id === xferProduct) ?? products[0];
  const variants = selectedProduct?.variants ?? [];
  const activeVariantId = xferVariant || firstVariantId(selectedProduct);

  const getProductTitle = (id: string) => products.find((p) => p.id === id)?.title ?? id;

  const inventory = useMemo(
    () => (selected ? partnerStockFor(movements, selected.id, locations) : []),
    [movements, selected, locations],
  );

  const totalPartnerInventory = partners.reduce(
    (sum, p) =>
      sum + partnerStockFor(movements, p.id, locations).reduce((s, i) => s + i.quantity, 0),
    0,
  );

  const partnerRegs = selected
    ? registrations.filter((r) => r.partnerId === selected.id)
    : [];
  const totalRegs = partners.reduce(
    (sum, p) => sum + registrations.filter((r) => r.partnerId === p.id).length,
    0,
  );
  const totalSold = partners.reduce((sum, p) => sum + p.productsSold, 0);
  const invUnits = inventory.reduce((s, i) => s + i.quantity, 0);
  const regPct =
    selected && selected.productsSold > 0
      ? Math.round((partnerRegs.length / selected.productsSold) * 100)
      : 0;

  const partnerMoves = selected
    ? movements.filter((m) => {
        const loc = locations.find((l) => l.partnerId === selected.id);
        if (loc) {
          return m.toLocationId === loc.id || m.fromLocationId === loc.id;
        }
        const locHint = selected.id.replace("partner-", "");
        return (
          m.toLocationId.includes(locHint) ||
          m.fromLocationId.includes(locHint) ||
          m.notes.toLowerCase().includes(selected.name.toLowerCase())
        );
      })
    : [];

  const openStockModal = (kind: "transfer" | "legacy" | "sale") => {
    const product = products[0];
    setXferProduct(product?.id ?? "");
    setXferVariant(firstVariantId(product));
    setXferQty(kind === "sale" ? 1 : 5);
    setXferNotes("");
    setModal(kind);
  };

  const openCreateModal = () => {
    setNewName("");
    setNewType("Retail Partner");
    setNewLocation("");
    setNewContact("");
    setNewMargin(0);
    setNewNotes("");
    setModal("create");
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  };

  const confirmModal = async () => {
    if (modal === "create") {
      if (!newName.trim()) {
        showToast("Partner name is required.");
        return;
      }
      setBusy(true);
      try {
        const partner = await createPartner({
          name: newName.trim(),
          partnerType: newType,
          locationLabel: newLocation.trim() || undefined,
          contact: newContact.trim() || undefined,
          margin: newMargin,
          merchandisingNotes: newNotes.trim() || undefined,
        });
        if (partner) {
          setSelectedId(partner.id);
          showToast(`Partner added: ${partner.name}`);
          setModal(null);
        } else {
          showToast("Could not create partner.");
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!selected) return;
    const variantId = activeVariantId || undefined;
    const productTitle = getProductTitle(xferProduct);

    if (modal === "transfer") {
      setBusy(true);
      try {
        const mv = await transfer({
          productId: xferProduct,
          variantId,
          partnerId: selected.id,
          quantity: xferQty,
          notes: xferNotes.trim() || undefined,
        });
        showToast(
          mv
            ? `Moved ${productTitle} ×${xferQty} from Studio → ${selected.name}`
            : "Transfer failed — check Studio available stock for this variant.",
        );
        if (mv) setModal(null);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (modal === "legacy") {
      if (!activeVariantId) {
        showToast("Select a product variant for legacy stock.");
        return;
      }
      setBusy(true);
      try {
        const result = await establishPartnerOpeningBalances(selected.id, [
          {
            productId: xferProduct,
            variantId: activeVariantId,
            quantity: xferQty,
            notes: xferNotes.trim() || undefined,
          },
        ]);
        if (!result) {
          showToast("Could not record legacy stock.");
        } else if (result.written.length) {
          showToast(
            `Legacy stock recorded: ${productTitle} ×${xferQty} at ${selected.name}`,
          );
          setModal(null);
        } else {
          showToast(
            "Skipped — this variant already has stock at the partner (use Transfer for more).",
          );
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (modal === "sale") {
      setBusy(true);
      try {
        const mv = await partnerSale({
          productId: xferProduct,
          variantId,
          partnerId: selected.id,
          quantity: xferQty,
          notes: xferNotes.trim() || undefined,
        });
        showToast(
          mv
            ? `Sale recorded: ${productTitle} ×${xferQty} deducted from ${selected.name}`
            : "Sale failed — partner has insufficient stock for this variant.",
        );
        if (mv) setModal(null);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (modal === "payment") {
      showToast("Payment recorded (metadata only — not a stock movement).");
      setModal(null);
    }
  };

  const modalTitle =
    modal === "create"
      ? "Add partner"
      : modal === "transfer"
        ? "Transfer from Studio"
        : modal === "legacy"
          ? "Add legacy stock"
          : modal === "sale"
            ? "Record sale"
            : modal === "payment"
              ? "Record payment"
              : "";

  if (!hydrated) {
    return (
      <>
        <Header title="Partners" subtitle="Loading partners…" />
        <main className="px-4 md:px-8 py-6">
          {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        </main>
      </>
    );
  }

  return (
    <>
      <Header
        title="Partners"
        subtitle="Add partners, move Studio stock to them, record legacy stock already on hand, and deduct sales."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {toast ? (
          <div className="rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
            {toast}
          </div>
        ) : null}
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}

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

        {!partners.length ? (
          <section className="card-surface p-8 text-center space-y-4">
            <p className="font-display text-xl text-deep-navy">No partners yet</p>
            <p className="text-sm text-charcoal/60 max-w-md mx-auto">
              Add a retail partner, then record legacy stock they already hold or transfer units
              from Studio. Sales deduct from their location.
            </p>
            <Button onClick={openCreateModal}>
              <Plus className="size-4" />
              Add partner
            </Button>
          </section>
        ) : (
          <div className="grid lg:grid-cols-[260px_1fr] gap-4">
            <aside className="card-surface p-3 space-y-2 h-fit">
              <Button size="sm" variant="outline" className="w-full" onClick={openCreateModal}>
                <Plus className="size-4" />
                Add partner
              </Button>
              {partners.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left rounded-xl px-3 py-3 border transition ${
                    selected?.id === p.id
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

            {selected ? (
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
                    <Button size="sm" variant="outline" onClick={() => openStockModal("transfer")}>
                      Transfer from Studio
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openStockModal("legacy")}>
                      Add legacy stock
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openStockModal("sale")}>
                      Record sale
                    </Button>
                    <Button size="sm" onClick={() => setModal("payment")}>
                      Record payment
                    </Button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <section className="card-surface p-5">
                    <h3 className="font-display text-lg text-deep-navy mb-3">
                      Inventory (from ledger)
                    </h3>
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
                    <p className="text-sm text-charcoal/70 leading-relaxed">
                      {selected.merchandisingNotes || "No notes yet."}
                    </p>
                  </section>
                </div>

                <section className="card-surface p-5">
                  <h3 className="font-display text-lg text-deep-navy mb-3">Stock movement</h3>
                  <ul className="space-y-2 text-sm">
                    {partnerMoves.slice(0, 12).map((m) => (
                      <li
                        key={m.id}
                        className="flex justify-between gap-3 border-b border-border pb-2"
                      >
                        <span>
                          {m.date} · {m.movementType} · {getProductTitle(m.productId)} ×
                          {m.quantity}
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
            ) : null}
          </div>
        )}
      </main>

      <Modal
        open={modal !== null}
        onClose={() => {
          if (!busy) setModal(null);
        }}
        title={modalTitle}
        footer={
          <Button onClick={() => void confirmModal()} disabled={busy}>
            {busy ? "Saving…" : "Confirm"}
          </Button>
        }
      >
        {modal === "create" ? (
          <div className="space-y-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Freshly Brewed Indiranagar"
                data-testid="partner-name"
              />
            </Field>
            <Field label="Type">
              <select
                className={selectClass}
                value={newType}
                onChange={(e) => setNewType(e.target.value as PartnerType)}
              >
                {PARTNER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location label">
              <input
                className={inputClass}
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="City / store name (defaults to partner name)"
              />
            </Field>
            <Field label="Contact">
              <input
                className={inputClass}
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                placeholder="Phone or email"
              />
            </Field>
            <Field label="Margin %">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={newMargin}
                onChange={(e) => setNewMargin(Number(e.target.value))}
              />
            </Field>
            <Field label="Merchandising notes">
              <textarea
                className={textareaClass}
                rows={3}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
            </Field>
          </div>
        ) : modal === "payment" ? (
          <p className="text-sm text-charcoal/70">
            Payment status is partner metadata (not a stock movement).
          </p>
        ) : (
          <div className="space-y-3">
            <Field label="Product">
              <select
                className={selectClass}
                value={xferProduct}
                onChange={(e) => {
                  const next = products.find((p) => p.id === e.target.value);
                  setXferProduct(e.target.value);
                  setXferVariant(firstVariantId(next));
                }}
                data-testid="partner-stock-product"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            {variants.length ? (
              <Field label="Variant">
                <select
                  className={selectClass}
                  value={activeVariantId}
                  onChange={(e) => setXferVariant(e.target.value)}
                  data-testid="partner-stock-variant"
                >
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Quantity">
              <input
                className={inputClass}
                type="number"
                min={1}
                value={xferQty}
                onChange={(e) => setXferQty(Number(e.target.value))}
                data-testid="partner-stock-qty"
              />
            </Field>
            <Field label="Notes (optional)">
              <input
                className={inputClass}
                value={xferNotes}
                onChange={(e) => setXferNotes(e.target.value)}
              />
            </Field>
            <p className="text-xs text-charcoal/55">
              {modal === "transfer"
                ? "Writes a Transfer: Studio → Partner. Deducts from Studio available stock."
                : modal === "legacy"
                  ? "One-time opening: External → Partner. Use when stock is already at the partner (does not leave Studio). Skipped if this variant already has partner qty."
                  : "Writes a Partner Sale: Partner → Sold. Deducts from partner stock."}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

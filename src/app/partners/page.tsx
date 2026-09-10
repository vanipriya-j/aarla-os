"use client";

import { useAppLedger, useAppNetwork } from "@/lib/client/use-app-data";
import { deriveBalances, partnerStockFor } from "@/lib/domain/ledger";
import { LOC } from "@/lib/domain/catalog";
import type { PartnerType } from "@/lib/domain/types";
import type {
  PartnerInvoice,
  UnbilledPartnerSale,
} from "@/lib/domain/partner-commerce-types";
import {
  buildAvailableStockOptions,
  optionKey,
  searchCatalogStockOptions,
  type PartnerStockOption,
} from "@/lib/domain/partner-stock-options";
import {
  listPartnerInvoicesAction,
  listUnbilledPartnerSalesAction,
  raisePartnerInvoiceAction,
  receivePartnerPaymentAction,
} from "@/app/actions/partner-commerce-actions";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/FormSection";
import { PartnerStockPicker } from "@/components/partners/PartnerStockPicker";
import {
  PartnerStockDraftLines,
  draftLineKey,
  toDraftLine,
  type PartnerDraftLine,
} from "@/components/partners/PartnerStockDraftLines";
import { Package, Plus, ScanLine, Store, ShoppingBag } from "lucide-react";

const PARTNER_TYPES: PartnerType[] = [
  "Retail Partner",
  "Reseller",
  "Pop-up",
  "Café",
  "Event",
  "Distributor",
];

type ModalKind =
  | "create"
  | "transfer"
  | "recall"
  | "legacy"
  | "sale"
  | "invoice"
  | "payment"
  | null;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function PartnersPage() {
  const {
    movements,
    postPartnerStockBatch,
    createPartner,
    establishPartnerOpeningBalances,
    partners,
    products,
    locations,
    hydrated,
    error,
    refresh,
  } = useAppLedger();
  const { registrations } = useAppNetwork();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);

  const [draftLines, setDraftLines] = useState<PartnerDraftLine[]>([]);
  const [xferNotes, setXferNotes] = useState("");
  const [productQuery, setProductQuery] = useState("");

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PartnerType>("Retail Partner");
  const [newLocation, setNewLocation] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newMargin, setNewMargin] = useState(0);
  const [newNotes, setNewNotes] = useState("");

  const [unbilled, setUnbilled] = useState<UnbilledPartnerSale[]>([]);
  const [selectedSaleUuids, setSelectedSaleUuids] = useState<string[]>([]);
  const [adjustedTotal, setAdjustedTotal] = useState(0);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoicePreview, setInvoicePreview] = useState<PartnerInvoice | null>(null);

  const [openInvoices, setOpenInvoices] = useState<PartnerInvoice[]>([]);
  const [payInvoiceId, setPayInvoiceId] = useState("");
  const [payAmount, setPayAmount] = useState(0);
  const [payNotes, setPayNotes] = useState("");
  const [payFile, setPayFile] = useState<File | null>(null);

  const selected =
    partners.find((p) => p.id === (selectedId ?? partners[0]?.id)) ?? partners[0];

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

  const partnerMoves = useMemo(() => {
    if (!selected) return [];
    const loc = locations.find((l) => l.partnerId === selected.id);
    const locHint = selected.id.replace("partner-", "");
    const filtered = movements.filter((m) => {
      if (loc) {
        return m.toLocationId === loc.id || m.fromLocationId === loc.id;
      }
      return (
        m.toLocationId.includes(locHint) ||
        m.fromLocationId.includes(locHint) ||
        m.notes.toLowerCase().includes(selected.name.toLowerCase())
      );
    });
    // Newest first — previously slice(0,12) kept the oldest and hid new transfers.
    return [...filtered].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.id.localeCompare(a.id);
    });
  }, [movements, selected, locations]);

  const balances = useMemo(() => deriveBalances(movements), [movements]);

  const partnerLocId = selected
    ? locations.find((l) => l.partnerId === selected.id)?.id
    : undefined;

  const stockSourceLocationId =
    modal === "transfer"
      ? LOC.studio
      : modal === "recall" || modal === "sale"
        ? partnerLocId
        : null;

  const stockOptions = useMemo(() => {
    if (modal === "legacy") return [];
    if (!stockSourceLocationId) return [];
    return buildAvailableStockOptions(products, balances, stockSourceLocationId);
  }, [modal, products, balances, stockSourceLocationId]);

  const catalogSearch = useMemo(() => {
    if (modal !== "legacy") return undefined;
    return (query: string) => searchCatalogStockOptions(products, query, 25);
  }, [modal, products]);

  const computedInvoiceTotal = useMemo(
    () =>
      Math.round(
        unbilled
          .filter((s) => selectedSaleUuids.includes(s.movementUuid))
          .reduce((sum, s) => sum + s.lineTotal, 0) * 100,
      ) / 100,
    [unbilled, selectedSaleUuids],
  );

  useEffect(() => {
    if (modal === "invoice") {
      setAdjustedTotal(computedInvoiceTotal);
    }
  }, [computedInvoiceTotal, modal]);

  const draftExcludeKeys = useMemo(
    () => new Set(draftLines.map((l) => draftLineKey(l))),
    [draftLines],
  );

  const openStockModal = (kind: "transfer" | "recall" | "legacy" | "sale") => {
    setDraftLines([]);
    setXferNotes("");
    setProductQuery("");
    setModal(kind);
  };

  const addDraftLine = (option: PartnerStockOption) => {
    setDraftLines((prev) => {
      const key = optionKey(option);
      const existing = prev.find((l) => draftLineKey(l) === key);
      if (existing) {
        const nextQty = existing.quantity + 1;
        const capped =
          option.available > 0 ? Math.min(nextQty, option.available) : nextQty;
        return prev.map((l) =>
          draftLineKey(l) === key ? { ...l, quantity: capped, available: option.available } : l,
        );
      }
      return [...prev, toDraftLine(option, 1)];
    });
    setProductQuery("");
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

  const openInvoiceModal = async () => {
    if (!selected) return;
    setBusy(true);
    setInvoicePreview(null);
    setInvoiceNotes("");
    try {
      const res = await listUnbilledPartnerSalesAction(selected.id);
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      setUnbilled(res.data);
      setSelectedSaleUuids(res.data.map((s) => s.movementUuid));
      setModal("invoice");
    } finally {
      setBusy(false);
    }
  };

  const openPaymentModal = async () => {
    if (!selected) return;
    setBusy(true);
    setPayFile(null);
    setPayNotes("");
    try {
      const res = await listPartnerInvoicesAction(selected.id);
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      const open = res.data.filter((i) =>
        ["issued", "partially_paid"].includes(i.status),
      );
      setOpenInvoices(open);
      const first = open[0];
      setPayInvoiceId(first?.id ?? "");
      setPayAmount(first?.balanceDue ?? 0);
      setModal("payment");
    } finally {
      setBusy(false);
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4200);
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
    if (
      modal === "transfer" ||
      modal === "recall" ||
      modal === "legacy" ||
      modal === "sale"
    ) {
      if (!draftLines.length) {
        showToast("Add at least one product line.");
        return;
      }
      for (const [i, line] of draftLines.entries()) {
        if (line.quantity <= 0) {
          showToast(`Line ${i + 1}: quantity must be positive.`);
          return;
        }
        if (modal !== "legacy" && line.available > 0 && line.quantity > line.available) {
          showToast(
            `Line ${i + 1}: only ${line.available} available for ${line.productTitle} · ${line.variantLabel}.`,
          );
          return;
        }
      }
    }

    if (modal === "transfer" || modal === "recall" || modal === "sale") {
      setBusy(true);
      try {
        const res = await postPartnerStockBatch({
          kind: modal,
          partnerId: selected.id,
          notes: xferNotes.trim() || undefined,
          lines: draftLines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            quantity: l.quantity,
          })),
        });
        if (!res.ok) {
          showToast(res.error);
          return;
        }
        const units = draftLines.reduce((s, l) => s + l.quantity, 0);
        const verb =
          modal === "transfer" ? "Transferred" : modal === "recall" ? "Recalled" : "Recorded sale of";
        showToast(`${verb} ${draftLines.length} lines · ${units} units · ${selected.name}`);
        setModal(null);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (modal === "legacy") {
      const missingVariant = draftLines.find((l) => !l.variantId);
      if (missingVariant) {
        showToast(`Select a variant for ${missingVariant.productTitle}.`);
        return;
      }
      setBusy(true);
      try {
        const result = await establishPartnerOpeningBalances(
          selected.id,
          draftLines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            quantity: l.quantity,
            notes: xferNotes.trim() || undefined,
          })),
        );
        if (!result) {
          showToast("Could not record legacy stock.");
        } else if (result.written.length) {
          showToast(
            `Legacy stock: ${result.written.length} lines written` +
              (result.skipped ? ` · ${result.skipped} skipped` : "") +
              ` at ${selected.name}`,
          );
          setModal(null);
        } else {
          showToast(
            "Skipped — those variants already have partner stock (use Transfer for more).",
          );
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (modal === "invoice") {
      if (!selectedSaleUuids.length) {
        showToast("Select at least one unbilled sale.");
        return;
      }
      setBusy(true);
      try {
        const res = await raisePartnerInvoiceAction({
          partnerId: selected.id,
          movementUuids: selectedSaleUuids,
          adjustedTotal,
          notes: invoiceNotes,
          issue: true,
        });
        if (!res.ok) {
          showToast(res.error);
          return;
        }
        setInvoicePreview(res.data);
        showToast(
          `Invoice ${res.data.code} issued · ₹${res.data.adjustedTotal.toLocaleString("en-IN")}`,
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (modal === "payment") {
      if (!payInvoiceId) {
        showToast("Select an invoice to pay against.");
        return;
      }
      if (payAmount <= 0) {
        showToast("Enter a payment amount.");
        return;
      }
      setBusy(true);
      try {
        let screenshotBase64: string | null = null;
        let screenshotFilename: string | undefined;
        let screenshotMimeType: string | undefined;
        if (payFile) {
          screenshotBase64 = await fileToBase64(payFile);
          screenshotFilename = payFile.name;
          screenshotMimeType = payFile.type || "image/jpeg";
        }
        const res = await receivePartnerPaymentAction({
          invoiceId: payInvoiceId,
          amount: payAmount,
          notes: payNotes,
          screenshotBase64,
          screenshotFilename,
          screenshotMimeType,
        });
        if (!res.ok) {
          showToast(res.error);
          return;
        }
        showToast(
          `Payment ${res.data.payment.code} received · invoice now ${res.data.invoice.status}`,
        );
        setModal(null);
        await refresh();
      } finally {
        setBusy(false);
      }
    }
  };

  const modalTitle =
    modal === "create"
      ? "Add partner"
      : modal === "transfer"
        ? "Transfer from Studio"
        : modal === "recall"
          ? "Recall to Studio"
          : modal === "legacy"
            ? "Add legacy stock"
            : modal === "sale"
              ? "Record sale"
              : modal === "invoice"
                ? invoicePreview
                  ? `Preview · ${invoicePreview.code}`
                  : "Raise invoice"
                : modal === "payment"
                  ? "Receive payment"
                  : "";

  const modalConfirmLabel =
    modal === "invoice"
      ? invoicePreview
        ? "Done"
        : "Generate & issue"
      : modal === "payment"
        ? "Receive payment"
        : modal === "transfer" ||
            modal === "recall" ||
            modal === "sale" ||
            modal === "legacy"
          ? draftLines.length
            ? `Confirm ${draftLines.length} line${draftLines.length === 1 ? "" : "s"}`
            : "Confirm"
          : "Confirm";

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
        subtitle="Stock in and out of partners, collate sales into invoices, and receive payments."
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
              from Studio. Sales deduct from their location; raise an invoice later.
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
                    <Button size="sm" variant="outline" onClick={() => openStockModal("recall")}>
                      Recall to Studio
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openStockModal("legacy")}>
                      Add legacy stock
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openStockModal("sale")}>
                      Record sale
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void openInvoiceModal()}>
                      Raise invoice
                    </Button>
                    <Button size="sm" onClick={() => void openPaymentModal()}>
                      Receive payment
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
                    {partnerMoves.slice(0, 20).map((m) => (
                      <li
                        key={m.id}
                        className="flex justify-between gap-3 border-b border-border pb-2"
                      >
                        <span>
                          {m.date} · {m.movementType} · {getProductTitle(m.productId)} ×
                          {m.quantity}
                        </span>
                        <span className="text-charcoal/50 break-all text-right max-w-[45%]">
                          {m.reference}
                        </span>
                      </li>
                    ))}
                    {!partnerMoves.length ? (
                      <li className="text-charcoal/50">No linked movements yet</li>
                    ) : null}
                  </ul>
                  {partnerMoves.length > 20 ? (
                    <p className="text-xs text-charcoal/50 mt-2">
                      Showing 20 of {partnerMoves.length} newest movements
                    </p>
                  ) : null}
                </section>
              </div>
            ) : null}
          </div>
        )}
      </main>

      <Modal
        open={modal !== null}
        onClose={() => {
          if (!busy) {
            setModal(null);
            setInvoicePreview(null);
          }
        }}
        title={modalTitle}
        footer={
          modal === "invoice" && invoicePreview ? (
            <Button
              onClick={() => {
                setModal(null);
                setInvoicePreview(null);
              }}
            >
              Done
            </Button>
          ) : (
            <Button onClick={() => void confirmModal()} disabled={busy}>
              {busy ? "Saving…" : modalConfirmLabel}
            </Button>
          )
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
        ) : modal === "invoice" ? (
          invoicePreview ? (
            <div className="space-y-3 text-sm" data-testid="partner-invoice-preview">
              <p className="font-display text-xl text-deep-navy">{invoicePreview.code}</p>
              <p className="text-charcoal/60">
                {invoicePreview.partnerName} · {invoicePreview.status}
              </p>
              <ul className="space-y-1 border-y border-border py-2">
                {invoicePreview.lines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span>{l.description}</span>
                    <span>₹{l.lineTotal.toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between">
                <span className="text-charcoal/55">Computed</span>
                <span>₹{invoicePreview.computedTotal.toLocaleString("en-IN")}</span>
              </p>
              <p className="flex justify-between font-medium text-deep-navy">
                <span>Invoice value</span>
                <span>₹{invoicePreview.adjustedTotal.toLocaleString("en-IN")}</span>
              </p>
              {invoicePreview.notes ? (
                <p className="text-charcoal/60">{invoicePreview.notes}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3" data-testid="partner-raise-invoice">
              {!unbilled.length ? (
                <p className="text-sm text-charcoal/60">
                  No unbilled partner sales since the last invoice. Record sales first.
                </p>
              ) : (
                <ul className="space-y-2 max-h-56 overflow-y-auto">
                  {unbilled.map((s) => {
                    const checked = selectedSaleUuids.includes(s.movementUuid);
                    return (
                      <li key={s.movementUuid}>
                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => {
                              setSelectedSaleUuids((prev) =>
                                checked
                                  ? prev.filter((id) => id !== s.movementUuid)
                                  : [...prev, s.movementUuid],
                              );
                            }}
                          />
                          <span className="flex-1">
                            {s.date} · {s.productTitle}
                            {s.variantLabel ? ` · ${s.variantLabel}` : ""} ×{s.quantity}
                            <span className="block text-xs text-charcoal/50">
                              ₹{s.lineTotal.toLocaleString("en-IN")} · {s.reference}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-sm text-charcoal/60">
                Computed from catalog prices: ₹{computedInvoiceTotal.toLocaleString("en-IN")}
              </p>
              <Field label="Invoice value (adjust if needed)">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  step="0.01"
                  value={adjustedTotal}
                  onChange={(e) => setAdjustedTotal(Number(e.target.value))}
                  data-testid="partner-invoice-adjusted"
                />
              </Field>
              <Field label="Notes">
                <textarea
                  className={textareaClass}
                  rows={2}
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                />
              </Field>
            </div>
          )
        ) : modal === "payment" ? (
          <div className="space-y-3" data-testid="partner-receive-payment">
            {!openInvoices.length ? (
              <p className="text-sm text-charcoal/60">
                No issued invoices with a balance due. Raise an invoice first.
              </p>
            ) : (
              <>
                <Field label="Invoice">
                  <select
                    className={selectClass}
                    value={payInvoiceId}
                    onChange={(e) => {
                      const inv = openInvoices.find((i) => i.id === e.target.value);
                      setPayInvoiceId(e.target.value);
                      setPayAmount(inv?.balanceDue ?? 0);
                    }}
                  >
                    {openInvoices.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} · due ₹{i.balanceDue.toLocaleString("en-IN")} ({i.status})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Amount received">
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    data-testid="partner-payment-amount"
                  />
                </Field>
                <Field label="Transaction screenshot">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="block w-full text-sm text-charcoal/70"
                    onChange={(e) => setPayFile(e.target.files?.[0] ?? null)}
                    data-testid="partner-payment-screenshot"
                  />
                </Field>
                <Field label="Notes">
                  <input
                    className={inputClass}
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder="UPI ref / bank transfer id"
                  />
                </Field>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <PartnerStockPicker
              options={stockOptions}
              searchOptions={catalogSearch}
              excludeKeys={draftExcludeKeys}
              query={productQuery}
              onQueryChange={setProductQuery}
              onAdd={addDraftLine}
              requireQuery
              emptyHint={
                modal === "legacy"
                  ? "Type to search the catalog, then add lines…"
                  : modal === "transfer"
                    ? "Type to add from Studio available stock…"
                    : "Type to add from this partner’s stock…"
              }
            />
            <PartnerStockDraftLines
              lines={draftLines}
              enforceAvailable={modal !== "legacy"}
              onQuantityChange={(key, quantity) => {
                setDraftLines((prev) =>
                  prev.map((l) => {
                    if (draftLineKey(l) !== key) return l;
                    const qty = Math.max(1, Math.floor(quantity) || 1);
                    const capped =
                      modal !== "legacy" && l.available > 0
                        ? Math.min(qty, l.available)
                        : qty;
                    return { ...l, quantity: capped };
                  }),
                );
              }}
              onRemove={(key) => {
                setDraftLines((prev) => prev.filter((l) => draftLineKey(l) !== key));
              }}
            />
            <Field label="Notes (optional — applied to all lines)">
              <input
                className={inputClass}
                value={xferNotes}
                onChange={(e) => setXferNotes(e.target.value)}
              />
            </Field>
            <p className="text-xs text-charcoal/55">
              {modal === "transfer"
                ? "Add multiple Studio SKUs, edit quantities, then confirm once — all lines post in one save."
                : modal === "recall"
                  ? "Add multiple partner SKUs to recall to Studio, edit quantities, confirm once."
                  : modal === "legacy"
                    ? "Add catalog lines for opening stock already at the partner; skipped if that variant already has qty."
                    : "Add multiple sale lines from partner stock, edit quantities, confirm once."}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

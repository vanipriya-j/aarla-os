"use client";

import { useAppLedger } from "@/lib/client/use-app-data";
import { useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Field, FormSection, inputClass, selectClass, textareaClass } from "@/components/ui/FormSection";
import { StepWorkflow } from "@/components/ui/StepWorkflow";
import { StatusChip } from "@/components/ui/StatusChip";
import { Barcode, CheckCircle2, ImageIcon, Printer } from "lucide-react";

const steps = [
  { id: "select", label: "Select PO" },
  { id: "qty", label: "Quantities" },
  { id: "qc", label: "QC" },
  { id: "resolve", label: "Discrepancy" },
  { id: "barcode", label: "Barcode" },
  { id: "shelf", label: "Shelf & Shopify" },
];

export default function ReceivePage() {
  const { purchaseOrders, receive, products, vendors, error } = useAppLedger();
  const getProductTitle = (id: string) => products.find((p) => p.id === id)?.title ?? id;
  const getVendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;
  const receivable = useMemo(
    () =>
      purchaseOrders.filter((p) =>
        ["Shipped", "Partial", "In Production", "Sent"].includes(p.status),
      ),
    [purchaseOrders],
  );

  const [step, setStep] = useState(0);
  const [poId, setPoId] = useState(receivable[0]?.id ?? "");
  const po = purchaseOrders.find((p) => p.id === poId) ?? receivable[0];

  const [ordered, setOrdered] = useState(po?.quantityOrdered ?? 0);
  const [received, setReceived] = useState(po?.quantityOrdered ?? 0);
  const [accepted, setAccepted] = useState(po?.quantityOrdered ?? 0);
  const [damaged, setDamaged] = useState(0);
  const [missing, setMissing] = useState(0);
  const [qcNotes, setQcNotes] = useState("");
  const [barcodeGenerated, setBarcodeGenerated] = useState(false);
  const [barcodePrinted, setBarcodePrinted] = useState(false);
  const [barcodeAttached, setBarcodeAttached] = useState(false);
  const [shelf, setShelf] = useState("A-12-C");
  const [done, setDone] = useState(false);
  const [shopifyPushNote, setShopifyPushNote] = useState<string | null>(null);
  const [refundType, setRefundType] = useState("replacement");

  const selectPo = (id: string) => {
    setPoId(id);
    const selected = purchaseOrders.find((p) => p.id === id);
    if (selected) {
      setOrdered(selected.quantityOrdered);
      const remaining = Math.max(selected.quantityOrdered - selected.quantityReceived, 0);
      setReceived(remaining);
      setAccepted(remaining);
      setDamaged(0);
      setMissing(0);
      setDone(false);
      setShopifyPushNote(null);
    }
  };

  const postToLedger = async () => {
    if (!po) return;
    const result = await receive({
      poId: po.id,
      accepted,
      damaged,
      missing,
      notes: qcNotes || `QC receive on shelf ${shelf}`,
    });
    if (result) {
      setDone(true);
      const push = result.shopifyPush;
      if (!push) {
        setShopifyPushNote(null);
      } else if (push.pushed > 0) {
        setShopifyPushNote(
          `Shopify Available updated for ${push.pushed} linked variant${push.pushed === 1 ? "" : "s"} at Aarla Office.`,
        );
      } else if (push.skippedUnlinked > 0 && !push.attempted) {
        setShopifyPushNote(
          "Product not linked to Shopify — ledger only. Link the catalog SKU to auto-push Available next time.",
        );
      } else if (push.errors.length) {
        setShopifyPushNote(
          `Ledger saved. Shopify Available push skipped: ${push.errors[0]}`,
        );
      } else {
        setShopifyPushNote(
          "Ledger saved. No Shopify Available change (missing inventory item ids or scopes).",
        );
      }
    }
  };

  return (
    <>
      <Header
        title="Receive Stock"
        subtitle="QC inbound stock, post Purchase Receipt to the ledger, and push Shopify Available at Aarla Office for linked SKUs."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-4xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        <div className="card-surface p-4">
          <StepWorkflow steps={steps} current={step} onStepClick={(i) => i <= step && setStep(i)} />
        </div>

        {step === 0 ? (
          <FormSection title="Select purchase order">
            <Field label="Purchase order">
              <select
                className={selectClass}
                value={po?.id ?? ""}
                onChange={(e) => selectPo(e.target.value)}
              >
                {receivable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} — {getProductTitle(p.productId)} ({p.status})
                  </option>
                ))}
              </select>
            </Field>
            {po ? (
              <div className="rounded-xl bg-pale-cream border border-border p-4 text-sm">
                <p className="font-medium text-deep-navy">{getProductTitle(po.productId)}</p>
                <p className="text-charcoal/60 mt-1">
                  {getVendorName(po.vendorId)} · Ordered {po.quantityOrdered} · Already received{" "}
                  {po.quantityReceived} · Required {po.requiredDate}
                </p>
              </div>
            ) : null}
            <Button
              onClick={() => {
                if (po) selectPo(po.id);
                setStep(1);
              }}
            >
              Continue
            </Button>
          </FormSection>
        ) : null}

        {step === 1 ? (
          <FormSection title="Quantities">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Quantity ordered">
                <input className={inputClass} type="number" value={ordered} readOnly />
              </Field>
              <Field label="Quantity received">
                <input
                  className={inputClass}
                  type="number"
                  value={received}
                  onChange={(e) => setReceived(Number(e.target.value))}
                />
              </Field>
              <Field label="Quantity accepted">
                <input
                  className={inputClass}
                  type="number"
                  value={accepted}
                  onChange={(e) => setAccepted(Number(e.target.value))}
                />
              </Field>
              <Field label="Quantity damaged">
                <input
                  className={inputClass}
                  type="number"
                  value={damaged}
                  onChange={(e) => setDamaged(Number(e.target.value))}
                />
              </Field>
              <Field label="Quantity missing">
                <input
                  className={inputClass}
                  type="number"
                  value={missing}
                  onChange={(e) => setMissing(Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)}>Continue to QC</Button>
            </div>
          </FormSection>
        ) : null}

        {step === 2 ? (
          <FormSection title="Quality check">
            <Field label="QC notes">
              <textarea
                className={textareaClass}
                value={qcNotes}
                onChange={(e) => setQcNotes(e.target.value)}
                placeholder="Print registration, damage notes…"
              />
            </Field>
            <div className="rounded-xl border border-dashed border-border-strong bg-pale-cream p-8 text-center">
              <ImageIcon className="h-8 w-8 text-charcoal/40 mx-auto mb-2" />
              <p className="text-sm font-medium text-deep-navy">QC photo placeholder</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>Continue</Button>
            </div>
          </FormSection>
        ) : null}

        {step === 3 ? (
          <FormSection title="Refund or replacement · Vendor discrepancy">
            <Field label="Request type">
              <select
                className={selectClass}
                value={refundType}
                onChange={(e) => setRefundType(e.target.value)}
              >
                <option value="replacement">Replacement for damaged + missing</option>
                <option value="refund">Partial refund</option>
                <option value="credit">Vendor credit note</option>
              </select>
            </Field>
            <div className="rounded-xl border border-border p-4 text-sm bg-white">
              <p className="font-medium text-deep-navy mb-2">Vendor discrepancy report</p>
              <p className="text-charcoal/70">
                PO {po?.id}: ordered {ordered}, received {received}, accepted {accepted}, damaged{" "}
                {damaged}, missing {missing}. Requesting {refundType}.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => setStep(4)}>Continue</Button>
            </div>
          </FormSection>
        ) : null}

        {step === 4 ? (
          <FormSection title="Barcode">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={barcodeGenerated ? "secondary" : "primary"}
                onClick={() => setBarcodeGenerated(true)}
              >
                <Barcode className="h-4 w-4" />
                {barcodeGenerated ? "Barcode generated" : "Generate barcode"}
              </Button>
              <Button
                variant="outline"
                disabled={!barcodeGenerated}
                onClick={() => setBarcodePrinted(true)}
              >
                <Printer className="h-4 w-4" />
                {barcodePrinted ? "Printed" : "Print barcode"}
              </Button>
            </div>
            {barcodeGenerated ? (
              <div className="rounded-xl border border-border bg-white p-6 text-center font-mono tracking-[0.35em] text-deep-navy">
                ||||| {po ? getProductTitle(po.productId).slice(0, 18).toUpperCase() : "AARLA"} |||||
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={barcodeAttached}
                onChange={(e) => setBarcodeAttached(e.target.checked)}
                disabled={!barcodePrinted}
              />
              Confirm barcode attached to cartons
            </label>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button disabled={!barcodeAttached} onClick={() => setStep(5)}>
                Continue
              </Button>
            </div>
          </FormSection>
        ) : null}

        {step === 5 ? (
          <FormSection title="Shelf location & post to ledger">
            <Field label="Assign shelf location">
              <input className={inputClass} value={shelf} onChange={(e) => setShelf(e.target.value)} />
            </Field>
            {done ? (
              <div className="rounded-xl bg-muted-green/25 border border-muted-green/40 p-5 flex gap-3">
                <CheckCircle2 className="h-6 w-6 text-[#4a5c3a]" />
                <div>
                  <p className="font-display text-xl text-deep-navy">Posted to stock ledger</p>
                  <p className="text-sm text-charcoal/70 mt-1">
                    Purchase Receipt (+{accepted}) and Damage (+{damaged}) written. Shelf {shelf}.
                  </p>
                  {shopifyPushNote ? (
                    <p className="text-sm text-charcoal/70 mt-2">{shopifyPushNote}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusChip label="Ledger updated" tone="success" />
                    <StatusChip
                      label={
                        shopifyPushNote?.includes("Available updated")
                          ? "Shopify Available pushed"
                          : "Shopify Available"
                      }
                      tone={
                        shopifyPushNote?.includes("Available updated") ? "success" : "info"
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-charcoal/55">
                  Confirming receive writes Studio stock and best-effort sets Shopify{" "}
                  <em>Available</em> at Aarla Office for linked variants (not Incoming / Committed).
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(4)}>
                    Back
                  </Button>
                  <Button onClick={postToLedger}>Confirm receive & write ledger</Button>
                </div>
              </div>
            )}
          </FormSection>
        ) : null}
      </main>
    </>
  );
}

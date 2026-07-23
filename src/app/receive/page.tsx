"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Field, FormSection, inputClass, selectClass, textareaClass } from "@/components/ui/FormSection";
import { StepWorkflow } from "@/components/ui/StepWorkflow";
import { StatusChip } from "@/components/ui/StatusChip";
import { purchaseOrders } from "@/lib/mock-data";
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
  const receivable = useMemo(
    () => purchaseOrders.filter((p) => ["Shipped", "Partial", "In Production"].includes(p.status)),
    [],
  );
  const [step, setStep] = useState(0);
  const [poId, setPoId] = useState(receivable[0]?.id ?? "");
  const [ordered, setOrdered] = useState(500);
  const [received, setReceived] = useState(492);
  const [accepted, setAccepted] = useState(480);
  const [damaged, setDamaged] = useState(8);
  const [missing, setMissing] = useState(4);
  const [barcodeGenerated, setBarcodeGenerated] = useState(false);
  const [barcodePrinted, setBarcodePrinted] = useState(false);
  const [barcodeAttached, setBarcodeAttached] = useState(false);
  const [shelf, setShelf] = useState("A-12-C");
  const [done, setDone] = useState(false);
  const [refundType, setRefundType] = useState("replacement");

  const po = purchaseOrders.find((p) => p.id === poId);

  const selectPo = (id: string) => {
    setPoId(id);
    const selected = purchaseOrders.find((p) => p.id === id);
    if (selected) {
      setOrdered(selected.quantityOrdered);
      setReceived(selected.quantityOrdered);
      setAccepted(selected.quantityOrdered);
      setDamaged(0);
      setMissing(0);
    }
  };

  return (
    <>
      <Header
        title="Receive Stock"
        subtitle="Guided receiving — quantities, QC, discrepancy, barcode and shelf."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-4xl">
        <div className="card-surface p-4">
          <StepWorkflow steps={steps} current={step} onStepClick={(i) => i <= step && setStep(i)} />
        </div>

        {step === 0 ? (
          <FormSection title="Select purchase order">
            <Field label="Purchase order">
              <select
                className={selectClass}
                value={poId}
                onChange={(e) => selectPo(e.target.value)}
              >
                {receivable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} — {p.productName} ({p.status})
                  </option>
                ))}
              </select>
            </Field>
            {po ? (
              <div className="rounded-xl bg-pale-cream border border-border p-4 text-sm">
                <p className="font-medium text-deep-navy">{po.productName}</p>
                <p className="text-charcoal/60 mt-1">
                  {po.vendorName} · Ordered {po.quantityOrdered} · Required {po.requiredDate}
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
                defaultValue="Print registration good on 478 units. 8 magnets with edge laminate lift. Carton 4 short vs packing list."
              />
            </Field>
            <div className="rounded-xl border border-dashed border-border-strong bg-pale-cream p-8 text-center">
              <ImageIcon className="h-8 w-8 text-charcoal/40 mx-auto mb-2" />
              <p className="text-sm font-medium text-deep-navy">QC photo placeholder</p>
              <p className="text-xs text-charcoal/55 mt-1">Tap to attach (simulated)</p>
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
                PO {poId}: ordered {ordered}, received {received}, accepted {accepted}, damaged {damaged},
                missing {missing}. Requesting {refundType} for {damaged + missing} units from{" "}
                {po?.vendorName}.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => setStep(4)}>Generate barcode</Button>
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
                ||||| AAR-MAG-NAV-09 |||||
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
          <FormSection title="Shelf location & Shopify readiness">
            <Field label="Assign shelf location">
              <input className={inputClass} value={shelf} onChange={(e) => setShelf(e.target.value)} />
            </Field>
            {done ? (
              <div className="rounded-xl bg-muted-green/25 border border-muted-green/40 p-5 flex gap-3">
                <CheckCircle2 className="h-6 w-6 text-[#4a5c3a]" />
                <div>
                  <p className="font-display text-xl text-deep-navy">Stock received & ready</p>
                  <p className="text-sm text-charcoal/70 mt-1">
                    {accepted} units on shelf {shelf}. Marked ready for Shopify (simulated).
                  </p>
                  <div className="mt-2 flex gap-2">
                    <StatusChip label="Inventory updated" tone="success" />
                    <StatusChip label="Shopify ready" tone="info" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(4)}>
                  Back
                </Button>
                <Button onClick={() => setDone(true)}>Mark ready for Shopify</Button>
              </div>
            )}
          </FormSection>
        ) : null}
      </main>
    </>
  );
}

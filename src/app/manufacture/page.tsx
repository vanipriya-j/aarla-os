"use client";

import { useLedger } from "@/lib/domain/use-ledger";
import { useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Field, FormSection, inputClass, selectClass } from "@/components/ui/FormSection";
import { Modal } from "@/components/ui/Modal";
import { StepWorkflow } from "@/components/ui/StepWorkflow";
import { StatusChip } from "@/components/ui/StatusChip";
import { getProductTitle, getVendorName, products, vendors } from "@/lib/domain";
import { CheckCircle2, FileText, Mail, MessageSquare, Paperclip } from "lucide-react";

type OrderMode = "new" | "reorder" | "quick";
type VendorForm = "bottle" | "magnet";

const steps = [
  { id: "mode", label: "Order type" },
  { id: "vendor", label: "Vendor form" },
  { id: "preview", label: "Previews" },
  { id: "send", label: "Approve & send" },
];

export default function ManufacturePage() {
  const { purchaseOrders, createManufacturingPO } = useLedger();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<OrderMode>("new");
  const [formType, setFormType] = useState<VendorForm>("bottle");
  const [productId, setProductId] = useState("prod-muruga-bottle");
  const [vendorId, setVendorId] = useState("vendor-velan");
  const [quantity, setQuantity] = useState(200);
  const [unitCost, setUnitCost] = useState(320);
  const [requiredDate, setRequiredDate] = useState("2026-08-10");
  const [preview, setPreview] = useState<"po" | "spec" | "email" | "wa" | "attach" | null>(null);
  const [sentPoId, setSentPoId] = useState<string | null>(null);

  const bottleVendors = useMemo(
    () => vendors.filter((v) => v.category.toLowerCase().includes("bottle")),
    [],
  );
  const magnetVendors = useMemo(
    () => vendors.filter((v) => v.category.toLowerCase().includes("magnet") || v.id === "vendor-pondy"),
    [],
  );

  const approve = () => {
    const po = createManufacturingPO({
      vendorId,
      productId,
      quantity,
      unitCost,
      requiredDate,
    });
    setSentPoId(po.id);
  };

  return (
    <>
      <Header
        title="Manufacture / Reorder"
        subtitle="Raises a canonical Purchase Order. Stock enters the ledger when you Receive."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-5xl">
        <div className="card-surface p-4">
          <StepWorkflow steps={steps} current={step} onStepClick={setStep} />
        </div>

        {step === 0 ? (
          <FormSection title="Choose order type">
            <div className="grid sm:grid-cols-3 gap-3">
              {(
                [
                  ["new", "New manufacturing order", "Fresh SKU or colourway"],
                  ["reorder", "Reorder existing product", "Restock a known SKU"],
                  ["quick", "Quick order", "Minimal fields for trusted vendors"],
                ] as const
              ).map(([id, label, desc]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`rounded-xl border p-4 text-left ${
                    mode === id ? "border-aarla-red bg-aarla-red/5" : "border-border bg-pale-cream"
                  }`}
                >
                  <p className="font-medium text-deep-navy text-sm">{label}</p>
                  <p className="text-xs text-charcoal/60 mt-1">{desc}</p>
                </button>
              ))}
            </div>
            <Field label="Product">
              <select
                className={selectClass}
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  const p = products.find((x) => x.id === e.target.value);
                  if (p) setUnitCost(p.cost);
                }}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {p.sku}
                  </option>
                ))}
              </select>
            </Field>
            <Button onClick={() => setStep(1)}>Continue to vendor form</Button>
          </FormSection>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <FormSection title="Vendor" description="Unified vendor catalog.">
              <div className="flex flex-wrap gap-2 mb-2">
                <Button
                  variant={formType === "bottle" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => {
                    setFormType("bottle");
                    setVendorId(bottleVendors[0]?.id ?? "vendor-velan");
                  }}
                >
                  Bottle vendor form
                </Button>
                <Button
                  variant={formType === "magnet" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => {
                    setFormType("magnet");
                    setVendorId(magnetVendors[0]?.id ?? "vendor-pondy");
                  }}
                >
                  Magnet vendor form
                </Button>
              </div>
              <Field label="Vendor">
                <select
                  className={selectClass}
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                >
                  {(formType === "bottle" ? bottleVendors : magnetVendors).concat(vendors).filter(
                    (v, i, arr) => arr.findIndex((x) => x.id === v.id) === i,
                  ).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.city} · MOQ {v.moq}
                    </option>
                  ))}
                </select>
              </Field>
            </FormSection>

            <FormSection title={formType === "bottle" ? "Bottle specification" : "Magnet specification"}>
              <div className="grid md:grid-cols-2 gap-4">
                {formType === "bottle" ? (
                  <>
                    <Field label="Bottle model">
                      <input className={inputClass} defaultValue="Aarla Dual-Wall Classic" />
                    </Field>
                    <Field label="Capacity">
                      <select className={selectClass} defaultValue="750">
                        <option value="500">500ml</option>
                        <option value="750">750ml</option>
                        <option value="1000">1000ml</option>
                      </select>
                    </Field>
                    <Field label="Body colour">
                      <input className={inputClass} defaultValue="Deep indigo" />
                    </Field>
                    <Field label="Print colour">
                      <input className={inputClass} defaultValue="Warm cream #F6EEDC" />
                    </Field>
                    <Field label="Artwork">
                      <input className={inputClass} defaultValue="Muruga_line_v3.pdf" />
                    </Field>
                    <Field label="Print position">
                      <select className={selectClass} defaultValue="front-center">
                        <option value="front-center">Front centre</option>
                        <option value="wrap">Wrap</option>
                        <option value="front-back">Front + back</option>
                      </select>
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Material">
                      <select className={selectClass} defaultValue="tin">
                        <option value="tin">Tin plate</option>
                        <option value="acrylic">Acrylic</option>
                        <option value="wood">Wood laminate</option>
                      </select>
                    </Field>
                    <Field label="Size">
                      <input className={inputClass} defaultValue="50 × 50 mm" />
                    </Field>
                    <Field label="Shape">
                      <select className={selectClass} defaultValue="rounded-square">
                        <option value="circle">Circle</option>
                        <option value="rounded-square">Rounded square</option>
                        <option value="custom">Custom die-cut</option>
                      </select>
                    </Field>
                    <Field label="Finish">
                      <input className={inputClass} defaultValue="Soft-touch laminate" />
                    </Field>
                    <Field label="Artwork">
                      <input className={inputClass} defaultValue="Navarathri_set_9.pdf" />
                    </Field>
                    <Field label="Packaging">
                      <input className={inputClass} defaultValue="Kraft sleeve · set of 9" />
                    </Field>
                  </>
                )}
                <Field label="Quantity">
                  <input
                    className={inputClass}
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </Field>
                <Field label="Unit cost (₹)">
                  <input
                    className={inputClass}
                    type="number"
                    value={unitCost}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                  />
                </Field>
                <Field label="Required date">
                  <input
                    className={inputClass}
                    type="date"
                    value={requiredDate}
                    onChange={(e) => setRequiredDate(e.target.value)}
                  />
                </Field>
              </div>
            </FormSection>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)}>Generate previews</Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <FormSection title="Document previews">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(
                [
                  ["po", "Purchase order", FileText],
                  ["spec", "Specification sheet", FileText],
                  ["email", "Email preview", Mail],
                  ["wa", "WhatsApp preview", MessageSquare],
                  ["attach", "Attachment checklist", Paperclip],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreview(id)}
                  className="rounded-xl border border-border bg-pale-cream p-4 text-left hover:border-aarla-red/40 flex items-center gap-3"
                >
                  <Icon className="h-5 w-5 text-aarla-red" />
                  <span className="text-sm font-medium text-deep-navy">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>Continue to approve</Button>
            </div>
          </FormSection>
        ) : null}

        {step === 3 ? (
          <FormSection title="Approve and send" description="Creates a Purchase Order in the shared domain store.">
            {sentPoId ? (
              <div className="rounded-xl bg-muted-green/25 border border-muted-green/40 p-6 flex gap-3">
                <CheckCircle2 className="h-6 w-6 text-[#4a5c3a] shrink-0" />
                <div>
                  <p className="font-display text-xl text-deep-navy">Order approved & marked sent</p>
                  <p className="text-sm text-charcoal/70 mt-1">
                    {sentPoId} created for {getVendorName(vendorId)} · {getProductTitle(productId)}.
                    Stock will enter the ledger when you Receive against this PO.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusChip label={sentPoId} tone="info" />
                    <StatusChip label="Status: Sent" tone="success" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-charcoal/70">
                  {getProductTitle(productId)} · qty {quantity} · ₹{unitCost} · {getVendorName(vendorId)}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button onClick={approve}>Approve and Send</Button>
                </div>
              </>
            )}
          </FormSection>
        ) : null}

        <section className="card-surface p-5">
          <h2 className="font-display text-xl text-deep-navy mb-3">Purchase orders</h2>
          <ul className="space-y-2">
            {purchaseOrders.map((po) => (
              <li
                key={po.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-deep-navy">
                    {po.id} · {getProductTitle(po.productId)}
                  </p>
                  <p className="text-xs text-charcoal/55">
                    {getVendorName(po.vendorId)} · qty {po.quantityOrdered} · due {po.requiredDate}
                  </p>
                </div>
                <StatusChip label={po.status} tone="info" />
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Modal open={preview !== null} onClose={() => setPreview(null)} title="Preview" wide>
        <p className="text-sm text-charcoal/70">
          Mock document for {getProductTitle(productId)} → {getVendorName(vendorId)} · qty {quantity}.
        </p>
      </Modal>
    </>
  );
}

"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Field, FormSection, inputClass, selectClass } from "@/components/ui/FormSection";
import { Modal } from "@/components/ui/Modal";
import { StepWorkflow } from "@/components/ui/StepWorkflow";
import { StatusChip } from "@/components/ui/StatusChip";
import { products, purchaseOrders, vendors } from "@/lib/mock-data";
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
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<OrderMode>("new");
  const [formType, setFormType] = useState<VendorForm>("bottle");
  const [preview, setPreview] = useState<"po" | "spec" | "email" | "wa" | "attach" | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <>
      <Header
        title="Manufacture / Reorder"
        subtitle="Raise vendor-specific orders, preview documents, and simulate sending."
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
            {mode === "reorder" ? (
              <Field label="Existing product">
                <select className={selectClass} defaultValue={products[0].id}>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · stock {p.inventory}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Button onClick={() => setStep(1)}>Continue to vendor form</Button>
          </FormSection>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <FormSection title="Vendor" description="Forms adapt to bottle or magnet suppliers.">
              <div className="flex flex-wrap gap-2 mb-2">
                <Button
                  variant={formType === "bottle" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setFormType("bottle")}
                >
                  Bottle vendor form
                </Button>
                <Button
                  variant={formType === "magnet" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setFormType("magnet")}
                >
                  Magnet vendor form
                </Button>
              </div>
              <Field label="Vendor">
                <select className={selectClass} defaultValue={formType === "bottle" ? "v1" : "v3"}>
                  {vendors
                    .filter((v) =>
                      formType === "bottle"
                        ? v.specialty.toLowerCase().includes("bottle")
                        : v.specialty.toLowerCase().includes("magnet"),
                    )
                    .concat(vendors)
                    .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.city} · MOQ {v.moq}
                      </option>
                    ))}
                </select>
              </Field>
            </FormSection>

            {formType === "bottle" ? (
              <FormSection title="Bottle specification">
                <div className="grid md:grid-cols-2 gap-4">
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
                  <Field label="Quantity">
                    <input className={inputClass} type="number" defaultValue={200} />
                  </Field>
                  <Field label="Unit cost (₹)">
                    <input className={inputClass} type="number" defaultValue={320} />
                  </Field>
                  <Field label="Required date">
                    <input className={inputClass} type="date" defaultValue="2026-08-10" />
                  </Field>
                </div>
              </FormSection>
            ) : (
              <FormSection title="Magnet specification">
                <div className="grid md:grid-cols-2 gap-4">
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
                  <Field label="Quantity per design">
                    <input className={inputClass} type="number" defaultValue={200} />
                  </Field>
                  <Field label="Packaging">
                    <input className={inputClass} defaultValue="Kraft sleeve · set of 9" />
                  </Field>
                  <Field label="Required date">
                    <input className={inputClass} type="date" defaultValue="2026-07-28" />
                  </Field>
                </div>
              </FormSection>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)}>Generate previews</Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <FormSection
            title="Document previews"
            description="Mock purchase order, specification sheet, email, WhatsApp and attachments."
          >
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
          <FormSection title="Approve and send" description="Simulated send — no live email or WhatsApp.">
            {sent ? (
              <div className="rounded-xl bg-muted-green/25 border border-muted-green/40 p-6 flex gap-3">
                <CheckCircle2 className="h-6 w-6 text-[#4a5c3a] shrink-0" />
                <div>
                  <p className="font-display text-xl text-deep-navy">Order approved & marked sent</p>
                  <p className="text-sm text-charcoal/70 mt-1">
                    Mock PO-2405 created for {formType === "bottle" ? "Sri Velan Bottles" : "Pondy Print House"}.
                    Vendor notification simulated via email + WhatsApp previews.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusChip label="PO-2405" tone="info" />
                    <StatusChip label="Status: Sent" tone="success" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-charcoal/70">
                  Review the previews, then approve. This prototype only updates local UI state.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button onClick={() => setSent(true)}>Approve and Send</Button>
                </div>
              </>
            )}
          </FormSection>
        ) : null}

        <section className="card-surface p-5">
          <h2 className="font-display text-xl text-deep-navy mb-3">Open purchase orders</h2>
          <ul className="space-y-2">
            {purchaseOrders.map((po) => (
              <li
                key={po.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-deep-navy">
                    {po.id} · {po.productName}
                  </p>
                  <p className="text-xs text-charcoal/55">
                    {po.vendorName} · qty {po.quantityOrdered} · due {po.requiredDate}
                  </p>
                </div>
                <StatusChip label={po.status} tone="info" />
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={
          preview === "po"
            ? "Purchase order preview"
            : preview === "spec"
              ? "Specification sheet"
              : preview === "email"
                ? "Email preview"
                : preview === "wa"
                  ? "WhatsApp preview"
                  : "Attachment checklist"
        }
        wide
      >
        {preview === "po" ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-deep-navy">PO-2405 · Draft</p>
            <p>Vendor: {formType === "bottle" ? "Sri Velan Bottles, Chennai" : "Pondy Print House"}</p>
            <p>Qty: 200 · Unit cost: ₹{formType === "bottle" ? "320" : "85"} · Total: ₹{formType === "bottle" ? "64,000" : "17,000"}</p>
            <p>Required by: 10 Aug 2026 · Payment: 40% advance / 60% on delivery</p>
          </div>
        ) : null}
        {preview === "spec" ? (
          <div className="text-sm space-y-2 text-charcoal/80">
            <p>Artwork: approved file attached · Colour: cream on indigo · Position: front centre</p>
            <p>QC: print registration ±1mm · packaging: individual poly + carton of 25</p>
            <p>Reject criteria: colour shift beyond Aarla cream swatch, dents, missing print</p>
          </div>
        ) : null}
        {preview === "email" ? (
          <div className="rounded-xl border border-border bg-pale-cream p-4 text-sm font-mono leading-relaxed">
            <p>To: orders@srivelan.example</p>
            <p>Subject: Aarla PO-2405 — Muruga bottle reorder</p>
            <p className="mt-3">Dear Velan team,</p>
            <p className="mt-2">
              Please find attached PO-2405 and artwork Muruga_line_v3.pdf. Kindly confirm lead time and advance invoice.
            </p>
            <p className="mt-2">Warmly, Aarla</p>
          </div>
        ) : null}
        {preview === "wa" ? (
          <div className="max-w-sm rounded-2xl bg-[#e7f0e4] p-4 text-sm">
            <p className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
              Vanakkam — PO-2405 ready. Artwork + PO PDF attached. Please confirm receipt and ETA. — Aarla
            </p>
          </div>
        ) : null}
        {preview === "attach" ? (
          <ul className="space-y-2 text-sm">
            {["PO PDF", "Specification sheet", "Artwork PDF", "Colour swatch reference", "Packaging notes"].map(
              (a) => (
                <li key={a} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-green" />
                  {a}
                </li>
              ),
            )}
          </ul>
        ) : null}
      </Modal>
    </>
  );
}

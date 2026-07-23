"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Field, FormSection, inputClass, selectClass, textareaClass } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import type { HamperOption } from "@/lib/types";
import { Check, Gift } from "lucide-react";

const mockOptions: HamperOption[] = [
  {
    id: "h1",
    name: "Chennai Classroom Classic",
    products: ["Chennai Market Tote", "Ganapathi Fridge Magnet Set", "Amman Stories — Children's Book"],
    packaging: "Kraft sleeve + mustard ribbon + thank-you card",
    cost: 720,
    sellingPrice: 1450,
    margin: 50.3,
    existingInventory: ["Chennai Market Tote (64)", "Ganapathi Fridge Magnet Set (210)", "Amman Stories (120)"],
    toManufacture: ["Thank-you cards × 100"],
    leadTimeDays: 7,
  },
  {
    id: "h2",
    name: "Ritual Desk Companion",
    products: [
      "Lakshmi Brass Davara Tumbler",
      "Bharatanatyam Gesture Pouch",
      "Ganapathi Fridge Magnet Set",
    ],
    packaging: "Soft beige box + tissue + QR story card",
    cost: 1080,
    sellingPrice: 2200,
    margin: 50.9,
    existingInventory: ["Bharatanatyam Gesture Pouch (88)", "Ganapathi Fridge Magnet Set (210)"],
    toManufacture: ["Lakshmi Brass Davara Tumbler × 82 (reorder)", "QR story cards × 100"],
    leadTimeDays: 28,
  },
  {
    id: "h3",
    name: "Festival Light Hamper",
    products: ["Muruga Water Bottle — 750ml", "Navarathri Magnet Assortment", "Story card pack"],
    packaging: "Reusable tote wrap + tissue + festive seal (restrained)",
    cost: 890,
    sellingPrice: 1850,
    margin: 51.9,
    existingInventory: ["Muruga Water Bottle — 750ml (42)"],
    toManufacture: ["Navarathri Magnet Assortment × 100", "Story card pack × 100", "Bottles × 58"],
    leadTimeDays: 18,
  },
];

export default function StoryPage() {
  const [generated, setGenerated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  const generate = () => {
    setGenerated(true);
    setSelected(null);
  };

  const convert = () => {
    setToast("Hamper option converted into project “Kumon Chennai Hampers” (simulated).");
    setTimeout(() => router.push("/projects/prj-2"), 1000);
  };

  return (
    <>
      <Header
        title="Your Story. Our Telling."
        subtitle="Custom gifting, institutional orders, event merchandise and hampers."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {toast ? (
          <div className="rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
            {toast}
          </div>
        ) : null}

        <FormSection
          title="Brief"
          description="Capture the client story so Aarla can propose grounded hamper options."
        >
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Client">
              <input className={inputClass} defaultValue="Kumon Learning Centre — Chennai" />
            </Field>
            <Field label="Occasion">
              <input className={inputClass} defaultValue="Teacher appreciation · mid-year" />
            </Field>
            <Field label="Story">
              <textarea
                className={textareaClass}
                defaultValue="Honour teachers who hold steady routines for children. Root the gift in Chennai everyday culture — markets, learning, small joys — without being childish."
              />
            </Field>
            <div className="grid grid-cols-2 gap-4 content-start">
              <Field label="Quantity">
                <input className={inputClass} type="number" defaultValue={100} />
              </Field>
              <Field label="Budget per hamper (₹)">
                <input className={inputClass} type="number" defaultValue={1500} />
              </Field>
              <Field label="Deadline">
                <input className={inputClass} type="date" defaultValue="2026-08-05" />
              </Field>
              <Field label="Delivery location">
                <input className={inputClass} defaultValue="T. Nagar, Chennai" />
              </Field>
            </div>
            <Field label="Branding requirements">
              <select className={selectClass} defaultValue="discreet">
                <option value="none">No client logo</option>
                <option value="discreet">Discreet client mention on card</option>
                <option value="co-brand">Co-branded sleeve</option>
              </select>
            </Field>
            <Field label="Personalisation">
              <input className={inputClass} defaultValue="First-name thank-you cards for 42 lead teachers" />
            </Field>
          </div>
          <div className="pt-2">
            <Button onClick={generate}>
              <Gift className="h-4 w-4" />
              Generate hamper options
            </Button>
          </div>
        </FormSection>

        {generated ? (
          <section className="space-y-4 animate-fade-up">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-display text-2xl text-deep-navy">Three options</h2>
              <Button disabled={!selected} onClick={convert}>
                Convert selected to project
              </Button>
            </div>
            <div className="grid lg:grid-cols-3 gap-4">
              {mockOptions.map((opt) => {
                const on = selected === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelected(opt.id)}
                    className={`text-left card-surface p-5 transition ${
                      on ? "ring-2 ring-aarla-red border-aarla-red" : "hover:border-aarla-red/35"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-display text-xl text-deep-navy">{opt.name}</h3>
                      {on ? (
                        <span className="h-6 w-6 rounded-full bg-aarla-red text-white flex items-center justify-center">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </div>
                    <ul className="text-sm text-charcoal/75 space-y-1 mb-3">
                      {opt.products.map((p) => (
                        <li key={p}>· {p}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-charcoal/55 mb-3">Packaging: {opt.packaging}</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <StatusChip label={`Cost ₹${opt.cost}`} tone="neutral" />
                      <StatusChip label={`Sell ₹${opt.sellingPrice}`} tone="info" />
                      <StatusChip label={`${opt.margin}% margin`} tone="success" />
                      <StatusChip label={`${opt.leadTimeDays}d lead`} tone="warning" />
                    </div>
                    <div className="text-xs space-y-2">
                      <div>
                        <p className="font-medium text-deep-navy mb-1">Existing inventory</p>
                        <p className="text-charcoal/65">{opt.existingInventory.join(" · ")}</p>
                      </div>
                      <div>
                        <p className="font-medium text-deep-navy mb-1">Must manufacture</p>
                        <p className="text-charcoal/65">{opt.toManufacture.join(" · ")}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}

"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Field, FormSection, inputClass, selectClass, textareaClass } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { launchChecklists } from "@/lib/mock-data";
import { AlertTriangle, CheckCircle2, Rocket } from "lucide-react";

function readinessScore(item: (typeof launchChecklists)[0]) {
  const flags = [
    item.photosReady,
    item.barcodeReady,
    item.shopifyReady,
    item.contentReady,
    item.inventory > 0,
    item.blockers.length === 0,
  ];
  return Math.round((flags.filter(Boolean).length / flags.length) * 100);
}

export default function LaunchPage() {
  const [items, setItems] = useState(launchChecklists);
  const [activeId, setActiveId] = useState(items[0]?.id);
  const active = items.find((i) => i.id === activeId) ?? items[0];
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<(typeof launchChecklists)[0]>) => {
    setItems((prev) => prev.map((i) => (i.id === active.id ? { ...i, ...patch } : i)));
    setSaved(false);
  };

  const score = readinessScore(active);

  return (
    <>
      <Header
        title="Launch Products"
        subtitle="Checklist every product from story to Shopify readiness."
        actions={
          <Button
            onClick={() => {
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
          >
            <Rocket className="h-4 w-4" />
            Save checklist
          </Button>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {saved ? (
          <div className="rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
            Launch checklist saved (local prototype state).
          </div>
        ) : null}

        <div className="grid lg:grid-cols-[280px_1fr] gap-4">
          <aside className="card-surface p-3 space-y-2 h-fit">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-charcoal/45">
              Upcoming launches
            </p>
            {items.map((item) => {
              const s = readinessScore(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  className={`w-full text-left rounded-xl px-3 py-3 border transition ${
                    active.id === item.id
                      ? "border-aarla-red bg-aarla-red/5"
                      : "border-transparent hover:bg-pale-cream"
                  }`}
                >
                  <p className="text-sm font-medium text-deep-navy leading-snug">{item.productName}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusChip
                      label={`${s}% ready`}
                      tone={s >= 80 ? "success" : s >= 50 ? "warning" : "danger"}
                    />
                    <span className="text-xs text-charcoal/50">{item.launchDate}</span>
                  </div>
                </button>
              );
            })}
          </aside>

          <div className="space-y-4">
            <div className="card-surface p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-deep-navy">{active.productName}</h2>
                <p className="text-sm text-charcoal/60 mt-1">
                  {active.category} · {active.world}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-charcoal/45">Readiness</p>
                <p className="font-display text-3xl text-aarla-red">{score}%</p>
              </div>
            </div>

            {active.blockers.length ? (
              <div className="rounded-xl border border-aarla-red/25 bg-aarla-red/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-aarla-red" />
                  <p className="text-sm font-medium text-aarla-red">Blockers</p>
                </div>
                <ul className="space-y-1">
                  {active.blockers.map((b) => (
                    <li key={b} className="text-sm text-charcoal/75">
                      · {b}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-xl border border-muted-green/40 bg-muted-green/20 p-4 flex items-center gap-2 text-sm text-deep-navy">
                <CheckCircle2 className="h-4 w-4" />
                No blockers — ready to schedule launch communications.
              </div>
            )}

            <FormSection title="Product details">
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Product name">
                  <input
                    className={inputClass}
                    value={active.productName}
                    onChange={(e) => update({ productName: e.target.value })}
                  />
                </Field>
                <Field label="Category">
                  <input
                    className={inputClass}
                    value={active.category}
                    onChange={(e) => update({ category: e.target.value })}
                  />
                </Field>
                <Field label="World">
                  <select
                    className={selectClass}
                    value={active.world}
                    onChange={(e) => update({ world: e.target.value })}
                  >
                    {["Muruga", "Lakshmi", "Ganapathi", "Chennai", "Navarathri", "Bharatanatyam", "Carnatic music"].map(
                      (w) => (
                        <option key={w}>{w}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Launch date">
                  <input
                    className={inputClass}
                    type="date"
                    value={active.launchDate}
                    onChange={(e) => update({ launchDate: e.target.value })}
                  />
                </Field>
                <Field label="Story">
                  <textarea
                    className={textareaClass}
                    value={active.story}
                    onChange={(e) => update({ story: e.target.value })}
                  />
                </Field>
                <Field label="Product description">
                  <textarea
                    className={textareaClass}
                    value={active.description}
                    onChange={(e) => update({ description: e.target.value })}
                  />
                </Field>
                <Field label="Selling price (₹)">
                  <input
                    className={inputClass}
                    type="number"
                    value={active.sellingPrice}
                    onChange={(e) => update({ sellingPrice: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Cost (₹)">
                  <input
                    className={inputClass}
                    type="number"
                    value={active.cost}
                    onChange={(e) => update({ cost: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Margin">
                  <input
                    className={inputClass}
                    readOnly
                    value={`${(((active.sellingPrice - active.cost) / active.sellingPrice) * 100).toFixed(1)}%`}
                  />
                </Field>
                <Field label="Inventory">
                  <input
                    className={inputClass}
                    type="number"
                    value={active.inventory}
                    onChange={(e) => update({ inventory: Number(e.target.value) })}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Readiness checklist">
              <div className="grid sm:grid-cols-2 gap-3">
                {(
                  [
                    ["photosReady", "Product photos"],
                    ["barcodeReady", "Barcode"],
                    ["shopifyReady", "Shopify readiness"],
                    ["contentReady", "Content readiness"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm cursor-pointer hover:bg-pale-cream"
                  >
                    <input
                      type="checkbox"
                      checked={active[key]}
                      onChange={(e) => update({ [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </FormSection>
          </div>
        </div>
      </main>
    </>
  );
}

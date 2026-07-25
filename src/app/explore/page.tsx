"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { FormSection, Field, inputClass } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { listProductsAction } from "@/app/actions/app-actions";
import { exploreIdea } from "@/lib/demo/workflow-helpers";
import type { IdeaExploration } from "@/lib/types";
import { Compass, Check } from "lucide-react";

export default function ExplorePage() {
  const [theme, setTheme] = useState("Muruga");
  const [result, setResult] = useState<IdeaExploration | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState(false);
  const [productTitles, setProductTitles] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const res = await listProductsAction();
      if (res.ok) setProductTitles(res.data.map((p) => p.title));
    })();
  }, []);

  const run = () => {
    const exploration = exploreIdea(theme);
    if (productTitles.length) {
      exploration.existingProducts = productTitles
        .filter((t) => t.toLowerCase().includes(theme.trim().toLowerCase()) || theme.length < 3)
        .slice(0, 4);
      if (exploration.existingProducts.length < 4) {
        exploration.existingProducts = [
          ...exploration.existingProducts,
          ...productTitles.filter((t) => !exploration.existingProducts.includes(t)),
        ].slice(0, 4);
      }
    }
    setResult(exploration);
    setSelected([]);
    setCreated(false);
  };

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const convert = () => {
    setCreated(true);
    setTimeout(() => router.push("/projects"), 900);
  };

  return (
    <>
      <Header
        title="Explore an Idea"
        subtitle="Enter a theme, motif or product — Aarla expands it into Worlds, objects and opportunities. (Demo exploration; catalog titles from database.)"
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        <FormSection title="Seed the idea" description="Start with a cultural world, a motif, or a product category.">
          <div className="flex flex-col sm:flex-row gap-3">
            <Field label="Theme / motif / product">
              <input
                className={inputClass}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g. Muruga, Navarathri, Carnatic music"
              />
            </Field>
            <div className="flex items-end">
              <Button onClick={run} size="lg" className="w-full sm:w-auto">
                <Compass className="h-4 w-4" />
                Explore
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {["Muruga", "Lakshmi", "Ganapathi", "Chennai", "Carnatic music", "Bharatanatyam", "Navarathri"].map(
              (t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`text-xs rounded-full px-3 py-1.5 border transition ${
                    theme === t
                      ? "bg-aarla-red text-white border-aarla-red"
                      : "border-border text-charcoal/70 hover:border-aarla-red/40"
                  }`}
                >
                  {t}
                </button>
              ),
            )}
          </div>
        </FormSection>

        {result ? (
          <div className="space-y-6 animate-fade-up">
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(
                [
                  ["Worlds", result.worlds],
                  ["Stories", result.stories],
                  ["Objects", result.objects],
                  ["Experiences", result.experiences],
                  ["Customer segments", result.customerSegments],
                  ["Existing products", result.existingProducts],
                ] as const
              ).map(([title, items]) => (
                <div key={title} className="card-surface p-5">
                  <h3 className="font-display text-lg text-deep-navy mb-3">{title}</h3>
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <li
                        key={item}
                        className="text-sm text-charcoal/80 pl-3 border-l-2 border-soft-beige"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="card-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-display text-xl text-deep-navy">Product opportunities</h3>
                  <p className="text-sm text-charcoal/60 mt-1">
                    Select opportunities to convert into a project. MOQ, unit cost and capital are mocked.
                  </p>
                </div>
                <Button disabled={selected.length === 0 || created} onClick={convert}>
                  {created ? "Project created…" : `Convert to project (${selected.length})`}
                </Button>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {result.productOpportunities.map((opp) => {
                  const on = selected.includes(opp.id);
                  return (
                    <button
                      key={opp.id}
                      type="button"
                      onClick={() => toggle(opp.id)}
                      className={`text-left rounded-xl border p-4 transition ${
                        on
                          ? "border-aarla-red bg-aarla-red/5 shadow-sm"
                          : "border-border bg-pale-cream hover:border-aarla-red/35"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-medium text-deep-navy text-sm leading-snug">{opp.name}</h4>
                        {on ? (
                          <span className="h-5 w-5 rounded-full bg-aarla-red text-white flex items-center justify-center shrink-0">
                            <Check className="h-3 w-3" />
                          </span>
                        ) : (
                          <span className="h-5 w-5 rounded-full border border-border shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-charcoal/65 leading-relaxed mb-3">{opp.rationale}</p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <StatusChip label={`MOQ ${opp.moq}`} tone="info" />
                        <StatusChip label={`₹${opp.unitCost}/unit`} tone="neutral" />
                        <StatusChip label={`₹${opp.estimatedCapital.toLocaleString("en-IN")} capital`} tone="warning" />
                      </div>
                      <p className="text-xs text-charcoal/55">Vendor: {opp.vendor}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card-surface p-5">
              <h3 className="font-display text-lg text-deep-navy mb-3">Relevant vendors</h3>
              <div className="flex flex-wrap gap-2">
                {result.relevantVendors.map((v) => (
                  <StatusChip key={v} label={v} tone="info" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="card-surface-pale p-10 text-center">
            <Compass className="h-8 w-8 text-aarla-red mx-auto mb-3" />
            <p className="font-display text-xl text-deep-navy">Begin with a world</p>
            <p className="text-sm text-charcoal/60 mt-2 max-w-md mx-auto">
              Try “Muruga” to see how Aarla expands a cultural seed into objects, segments and capital estimates.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

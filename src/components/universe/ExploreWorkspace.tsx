"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Compass, ImageIcon } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { FormSection, Field, inputClass } from "@/components/ui/FormSection";
import { Modal } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/StatusChip";
import { AffinityMap } from "@/components/universe/AffinityMap";
import { RankedOpportunities } from "@/components/universe/RankedOpportunities";
import { NodeTypeChips } from "@/components/universe/NodeTypeChips";
import {
  adjustUniverseAffinityAction,
  confirmUniverseRelationshipAction,
  createUniverseContentConceptAction,
  createUniverseNodeAction,
  createUniverseProductOpportunityAction,
  exploreUniverseAction,
  listFutureUniverseNodesAction,
  rejectUniverseRelationshipAction,
} from "@/app/actions/universe-actions";
import type {
  AffinityResult,
  CreativeNode,
  CreativeNodeType,
  ExploreUniverseResult,
} from "@/lib/domain/creative-types";

const EXAMPLES = [
  "Temple Bell",
  "Small brass bell",
  "Drishti",
  "Morning rituals",
  "Panchaloha",
  "Guru gift",
  "Chennai rain",
];

export function ExploreWorkspace() {
  const router = useRouter();
  const [narrative, setNarrative] = useState("Temple Bell");
  const [result, setResult] = useState<ExploreUniverseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AffinityResult | null>(null);
  const [future, setFuture] = useState<CreativeNode[]>([]);
  const [futureFilter, setFutureFilter] = useState<CreativeNodeType | "unclassified" | "all">(
    "all",
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createMode, setCreateMode] = useState<"unclassified" | "object" | "content">("unclassified");
  const [contentTitle, setContentTitle] = useState("");
  const [contentAngle, setContentAngle] = useState("");
  const [productTitle, setProductTitle] = useState("");

  function runExplore(q = narrative) {
    setError(null);
    startTransition(async () => {
      const res = await exploreUniverseAction(q);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data);
      setSelected(null);
      const fut = await listFutureUniverseNodesAction(
        futureFilter === "all" ? undefined : futureFilter,
      );
      if (fut.ok) setFuture(fut.data);
    });
  }

  function refreshFuture(filter = futureFilter) {
    startTransition(async () => {
      const fut = await listFutureUniverseNodesAction(filter === "all" ? undefined : filter);
      if (fut.ok) setFuture(fut.data);
    });
  }

  async function confirm(id: string) {
    setBusyId(id);
    const res = await confirmUniverseRelationshipAction(id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    runExplore();
  }

  async function reject(id: string) {
    setBusyId(id);
    const res = await rejectUniverseRelationshipAction(id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    runExplore();
  }

  async function saveUnclassified() {
    const res = await createUniverseNodeAction({
      title: createTitle || narrative,
      saveUnclassified: true,
      isFuture: true,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreateOpen(false);
    router.push(`/universe/${res.data.id}`);
  }

  async function createProductFromCenter() {
    if (!result) return;
    const title = productTitle.trim() || `Small Brass ${result.center.title}`;
    const res = await createUniverseProductOpportunityAction({
      fromNodeId: result.center.id,
      title,
      object: title,
      proposedProductType: "Object",
      material: "Brass",
      isFuture: true,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreateMode("unclassified");
    setCreateOpen(false);
    runExplore();
    router.push(`/universe/${res.data.node.id}`);
  }

  async function createContentFromCenter() {
    if (!result) return;
    const title =
      contentTitle.trim() || `Science behind ${result.center.title.toLowerCase()}`;
    const res = await createUniverseContentConceptAction({
      fromNodeId: result.center.id,
      workingTitle: title,
      angle: contentAngle || `Editorial exploration of ${result.center.title}`,
      format: "Essay / reel series",
      isFuture: true,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreateOpen(false);
    runExplore();
    router.push(`/universe/${res.data.node.id}`);
  }

  return (
    <>
      <Header
        title="Explore an Idea"
        subtitle="Capture a thought. Aarla maps every plausible place it can live — Worlds, concepts, collections, objects, stories and research."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        <FormSection
          title="Seed the idea"
          description="Capture first. Connect broadly. Classify progressively."
        >
          <Field label="Free-text narrative">
            <textarea
              className={`${inputClass} min-h-[88px]`}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Temple bell, Drishti, Chennai rain…"
              data-testid="universe-input"
            />
          </Field>
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-strong bg-pale-cream/50 px-4 py-3 text-sm text-charcoal/55">
            <ImageIcon className="h-4 w-4 shrink-0" />
            Image upload placeholder — attach references in a later iteration.
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setNarrative(t)}
                className={`text-xs rounded-full px-3 py-1.5 border transition ${
                  narrative === t
                    ? "bg-aarla-red text-white border-aarla-red"
                    : "border-border text-charcoal/70 hover:border-aarla-red/40"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              disabled={pending || !narrative.trim()}
              onClick={() => runExplore()}
              data-testid="universe-explore-btn"
            >
              <Compass className="h-4 w-4" />
              {pending ? "Exploring…" : "Explore Aarla Universe"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setCreateMode("unclassified");
                setCreateTitle(narrative);
                setCreateOpen(true);
              }}
            >
              Save now, classify later
            </Button>
          </div>
          {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        </FormSection>

        {result ? (
          <div className="space-y-6 animate-fade-up" data-testid="universe-result">
            <section className="rounded-2xl border border-border bg-white/70 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-charcoal/45">Central idea</p>
                  <h2 className="font-display text-2xl text-deep-navy mt-1">{result.center.title}</h2>
                  <p className="text-sm text-charcoal/65 mt-1 max-w-2xl">
                    {result.center.description || "Newly captured idea."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <NodeTypeChips types={result.center.nodeTypes} />
                    <StatusChip
                      label={result.center.isFuture ? "Future" : "Existing"}
                      tone={result.center.isFuture ? "warning" : "success"}
                    />
                    <StatusChip label={result.center.lifecycleStatus} tone="info" />
                    {result.created ? (
                      <StatusChip label="Just captured" tone="accent" />
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCreateMode("object");
                      setProductTitle(`Small Brass ${result.center.title}`);
                      setCreateOpen(true);
                    }}
                  >
                    Create Product Opportunity
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCreateMode("content");
                      setContentTitle(`Science behind ${result.center.title.toLowerCase()}`);
                      setContentAngle(`Why ${result.center.title} matters culturally and sonically.`);
                      setCreateOpen(true);
                    }}
                  >
                    Create Content Concept
                  </Button>
                  <Button variant="ghost" onClick={() => router.push(`/universe/${result.center.id}`)}>
                    Open node
                  </Button>
                </div>
              </div>
            </section>

            <FormSection title="Affinity map" description="Grouped by type — every score has a reason.">
              <AffinityMap
                center={result.center}
                byCategory={result.byCategory}
                onSelect={setSelected}
              />
            </FormSection>

            {selected ? (
              <div
                className="rounded-2xl border border-aarla-red/30 bg-white px-4 py-3"
                data-testid="selected-affinity"
              >
                <p className="font-display text-xl text-deep-navy">
                  {selected.node.title} — {selected.score}% affinity
                </p>
                <p className="text-sm text-charcoal/75 mt-1">{selected.explanation}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => confirm(selected.relationship.id)}>
                    Confirm Relationship
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reject(selected.relationship.id)}
                  >
                    Reject Relationship
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const next = Math.min(100, selected.score + 5);
                      const res = await adjustUniverseAffinityAction(
                        selected.relationship.id,
                        next,
                        `${selected.explanation} (founder adjusted affinity to ${next}%).`,
                      );
                      if (res.ok) runExplore();
                      else setError(res.error);
                    }}
                  >
                    Adjust Affinity +5
                  </Button>
                </div>
              </div>
            ) : null}

            <FormSection
              title="Ranked opportunities"
              description="Existing and future — confirm, reject, or grow the graph."
            >
              <RankedOpportunities
                affinities={result.affinities}
                busyId={busyId}
                onConfirm={confirm}
                onReject={reject}
                onCreateObject={(a) => {
                  setCreateMode("object");
                  setProductTitle(`Small Brass form of ${a.node.title}`);
                  setCreateOpen(true);
                }}
                onCreateContent={(a) => {
                  setCreateMode("content");
                  setContentTitle(`Story of ${a.node.title}`);
                  setContentAngle(a.explanation);
                  setCreateOpen(true);
                }}
              />
            </FormSection>

            {result.suggestedNewNodes.length ? (
              <FormSection title="Suggested new nodes" description="Uncommitted ideas you can create.">
                <ul className="space-y-2">
                  {result.suggestedNewNodes.map((s) => (
                    <li
                      key={s.title}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-deep-navy">{s.title}</p>
                        <p className="text-xs text-charcoal/60">{s.rationale}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const res = await createUniverseNodeAction({
                            title: s.title,
                            nodeTypes: s.nodeTypes,
                            description: s.rationale,
                            isFuture: true,
                            relatedNodeId: result.center.id,
                            explanation: s.rationale,
                            affinityScore: 78,
                          });
                          if (res.ok) runExplore();
                          else setError(res.error);
                        }}
                      >
                        Create New Node
                      </Button>
                    </li>
                  ))}
                </ul>
              </FormSection>
            ) : null}

            <FormSection
              title="Future ideas"
              description="Concepts, collections, objects and unclassified seeds waiting to mature."
            >
              <div className="flex flex-wrap gap-2 mb-3">
                {(
                  [
                    ["all", "All future"],
                    ["concept", "Future Concepts"],
                    ["collection", "Future Collections"],
                    ["object", "Future Objects"],
                    ["product-opportunity", "Future Products"],
                    ["campaign", "Future Campaigns"],
                    ["unclassified", "Unclassified Ideas"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setFutureFilter(value);
                      refreshFuture(value);
                    }}
                    className={`text-xs rounded-full px-3 py-1.5 border ${
                      futureFilter === value
                        ? "bg-deep-navy text-white border-deep-navy"
                        : "border-border text-charcoal/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul className="grid sm:grid-cols-2 gap-2">
                {future.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="w-full text-left rounded-xl border border-border bg-pale-cream/40 px-3 py-2 hover:border-aarla-red/40"
                      onClick={() => router.push(`/universe/${n.id}`)}
                      data-testid={`future-node-${n.slug}`}
                    >
                      <p className="text-sm font-medium text-deep-navy">{n.title}</p>
                      <p className="text-xs text-charcoal/55">{n.nodeTypes.join(", ")}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </FormSection>
          </div>
        ) : null}
      </main>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={
          createMode === "content"
            ? "Create Content Concept"
            : createMode === "object"
              ? "Create Product Opportunity"
              : "Save idea"
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (createMode === "content") void createContentFromCenter();
                else if (createMode === "object") void createProductFromCenter();
                else void saveUnclassified();
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {createMode === "unclassified" ? (
          <Field label="Title">
            <input
              className={inputClass}
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
            />
          </Field>
        ) : null}
        {createMode === "object" ? (
          <Field label="Product opportunity title">
            <input
              className={inputClass}
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
              data-testid="product-opp-title"
            />
          </Field>
        ) : null}
        {createMode === "content" ? (
          <div className="space-y-3">
            <Field label="Working title">
              <input
                className={inputClass}
                value={contentTitle}
                onChange={(e) => setContentTitle(e.target.value)}
                data-testid="content-concept-title"
              />
            </Field>
            <Field label="Angle">
              <textarea
                className={inputClass}
                value={contentAngle}
                onChange={(e) => setContentAngle(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { FormSection, Field, inputClass } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { NodeTypeChips } from "@/components/universe/NodeTypeChips";
import {
  addUniverseNoteAction,
  getUniverseNodeAction,
  markUniverseNodeFutureAction,
  promoteUniverseNodeAction,
} from "@/app/actions/universe-actions";
import type { AffinityCategory, AffinityResult, CreativeEvent, CreativeNode, CreativeNodeNote } from "@/lib/domain/creative-types";

export default function UniverseNodePage() {
  const params = useParams<{ nodeId: string }>();
  const nodeId = params.nodeId;
  const [node, setNode] = useState<CreativeNode | null>(null);
  const [byCategory, setByCategory] = useState<Record<AffinityCategory, AffinityResult[]> | null>(
    null,
  );
  const [notes, setNotes] = useState<CreativeNodeNote[]>([]);
  const [events, setEvents] = useState<CreativeEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const res = await getUniverseNodeAction(nodeId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!res.data) {
        setError("Node not found");
        return;
      }
      setNode(res.data.node);
      setByCategory(res.data.byCategory);
      setNotes(res.data.notes);
      setEvents(res.data.events);
      setError(null);
    });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getUniverseNodeAction(nodeId);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!res.data) {
        setError("Node not found");
        return;
      }
      setNode(res.data.node);
      setByCategory(res.data.byCategory);
      setNotes(res.data.notes);
      setEvents(res.data.events);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  if (error && !node) {
    return (
      <main className="px-8 py-10">
        <p className="text-aarla-red">{error}</p>
        <Link href="/explore" className="underline text-sm">
          Back to Explore
        </Link>
      </main>
    );
  }

  if (!node || !byCategory) {
    return (
      <main className="px-8 py-10 text-sm text-charcoal/60">
        {pending ? "Loading node…" : "Loading…"}
      </main>
    );
  }

  return (
    <>
      <Header title={node.title} subtitle="Aarla Universe node detail" />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-5xl">
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 text-sm text-deep-navy hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Explore
        </Link>

        <section className="rounded-2xl border border-border bg-white/80 px-5 py-4 space-y-3">
          <NodeTypeChips types={node.nodeTypes} />
          <p className="text-sm text-charcoal/75 leading-relaxed">{node.description}</p>
          <div className="flex flex-wrap gap-2">
            <StatusChip label={node.lifecycleStatus} tone="info" />
            <StatusChip label={node.maturityStatus} tone="neutral" />
            <StatusChip
              label={node.isFuture ? "Future" : "Existing"}
              tone={node.isFuture ? "warning" : "success"}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await promoteUniverseNodeAction(node.id, ["concept"], true);
                load();
              }}
            >
              Promote to Concept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await promoteUniverseNodeAction(node.id, ["collection"], true);
                load();
              }}
            >
              Create Collection
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await promoteUniverseNodeAction(node.id, ["product-opportunity"], true);
                load();
              }}
            >
              Create Product Opportunity
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await markUniverseNodeFutureAction(node.id, !node.isFuture);
                load();
              }}
            >
              {node.isFuture ? "Mark Existing" : "Mark as Future"}
            </Button>
          </div>
        </section>

        {(
          [
            "Worlds",
            "Concepts",
            "Collections",
            "Objects",
            "Stories / Content",
            "Research",
            "People / Places",
          ] as AffinityCategory[]
        ).map((cat) => {
          const items = byCategory[cat] ?? [];
          if (!items.length) return null;
          return (
            <FormSection key={cat} title={cat}>
              <ul className="space-y-2">
                {items.map((a) => (
                  <li key={a.relationship.id} className="border-l-2 border-soft-beige pl-3">
                    <Link
                      href={`/universe/${a.node.id}`}
                      className="text-sm font-medium text-deep-navy hover:underline"
                    >
                      {a.node.title}
                    </Link>
                    <span className="text-xs text-aarla-red ml-2">{a.score}%</span>
                    <p className="text-xs text-charcoal/65 mt-0.5">{a.explanation}</p>
                  </li>
                ))}
              </ul>
            </FormSection>
          );
        })}

        <FormSection title="Notes">
          <div className="flex gap-2">
            <Field label="Add note">
              <input
                className={inputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Observation, research lead, vendor hint…"
              />
            </Field>
            <div className="flex items-end">
              <Button
                onClick={async () => {
                  if (!note.trim()) return;
                  await addUniverseNoteAction(node.id, note);
                  setNote("");
                  load();
                }}
              >
                Add Note
              </Button>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="text-sm text-charcoal/75 border-b border-border pb-2">
                {n.body}
                <span className="block text-xs text-charcoal/45 mt-1">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </FormSection>

        <FormSection title="Activity">
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="text-xs text-charcoal/65">
                <span className="text-deep-navy font-medium">{e.eventType}</span>
                {" · "}
                {new Date(e.createdAt).toLocaleString()}
                {e.reasoning ? ` — ${e.reasoning}` : ""}
              </li>
            ))}
          </ul>
        </FormSection>
      </main>
    </>
  );
}

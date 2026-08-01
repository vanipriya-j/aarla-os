"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { NodeTypeChips } from "@/components/universe/NodeTypeChips";
import type { AffinityResult } from "@/lib/domain/creative-types";

type Props = {
  affinities: AffinityResult[];
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onCreateObject: (from: AffinityResult) => void;
  onCreateContent: (from: AffinityResult) => void;
  busyId?: string | null;
};

export function RankedOpportunities({
  affinities,
  onConfirm,
  onReject,
  onCreateObject,
  onCreateContent,
  busyId,
}: Props) {
  if (!affinities.length) {
    return (
      <p className="text-sm text-charcoal/60">
        No affinities yet — save related nodes or explore a seeded idea like Temple Bell.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {affinities.map((a) => (
        <article
          key={a.relationship.id}
          className="rounded-2xl border border-border bg-white/80 px-4 py-3 space-y-2"
          data-testid={`affinity-row-${a.node.slug}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/universe/${a.node.id}`}
                  className="font-display text-lg text-deep-navy hover:underline"
                >
                  {a.node.title}
                </Link>
                <StatusChip label={`${a.score}%`} tone="accent" />
                <StatusChip
                  label={a.relationship.relationshipStatus}
                  tone={
                    a.relationship.relationshipStatus === "established"
                      ? "success"
                      : a.relationship.relationshipStatus === "suggested"
                        ? "warning"
                        : "info"
                  }
                />
                <StatusChip
                  label={a.node.isFuture ? "Future" : "Existing"}
                  tone={a.node.isFuture ? "warning" : "neutral"}
                />
              </div>
              <p className="text-xs text-charcoal/55 mt-1">
                {a.category} · {a.relationship.relationshipType}
              </p>
            </div>
            <NodeTypeChips types={a.node.nodeTypes} />
          </div>
          <p className="text-sm text-charcoal/80 leading-relaxed">
            <span className="text-deep-navy font-medium">Why: </span>
            {a.explanation}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {a.relationship.relationshipStatus === "suggested" ||
            a.relationship.relationshipStatus === "inferred" ? (
              <>
                <Button
                  size="sm"
                  disabled={busyId === a.relationship.id}
                  onClick={() => onConfirm(a.relationship.id)}
                >
                  Confirm Relationship
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === a.relationship.id}
                  onClick={() => onReject(a.relationship.id)}
                >
                  Reject
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => onCreateObject(a)}>
              Create Product Opportunity
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onCreateContent(a)}>
              Create Content Concept
            </Button>
            <Link
              href={`/universe/${a.node.id}`}
              className="text-xs underline text-deep-navy self-center px-2"
            >
              Open node
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

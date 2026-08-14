"use client";

import type { MetricCard } from "@/lib/domain/operating-metrics-types";
import type { MetricStatus } from "@/lib/domain/operating-week";
import { StatusChip } from "@/components/ui/StatusChip";

function statusTone(status: MetricStatus): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "DONE":
    case "ON TRACK":
      return "success";
    case "AT RISK":
      return "warning";
    case "BEHIND":
      return "danger";
    default:
      return "neutral";
  }
}

function formatValue(card: MetricCard): string {
  if (card.unit === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(card.actual);
  }
  return new Intl.NumberFormat("en-IN").format(card.actual);
}

function formatTarget(card: MetricCard): string {
  if (card.unit === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(card.target);
  }
  return new Intl.NumberFormat("en-IN").format(card.target);
}

export function MetricStatusCard({
  card,
  sourceHint,
}: {
  card: MetricCard;
  sourceHint?: string;
}) {
  const pct =
    card.target > 0 ? Math.min(999, Math.round((card.actual / card.target) * 100)) : 0;

  return (
    <div className="rounded-xl border border-border bg-white/80 p-4 space-y-3" data-testid={`metric-${card.key}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-charcoal/50">
            {card.label}
          </p>
          {sourceHint ? (
            <p className="mt-0.5 text-[11px] text-charcoal/45">{sourceHint}</p>
          ) : null}
        </div>
        <StatusChip label={card.status} tone={statusTone(card.status)} />
      </div>
      <p className="font-display text-3xl text-deep-navy">{formatValue(card)}</p>
      <div className="text-sm text-charcoal/60 space-y-0.5">
        <p>
          Target <span className="text-deep-navy font-medium">{formatTarget(card)}</span>
          {" · "}
          {pct}%
        </p>
        <p className="text-xs text-charcoal/45">
          Expected by now:{" "}
          {card.unit === "INR"
            ? new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0,
              }).format(card.expectedByNow)
            : new Intl.NumberFormat("en-IN").format(card.expectedByNow)}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-pale-cream overflow-hidden">
        <div
          className="h-full rounded-full bg-aarla-red/80 transition-all"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

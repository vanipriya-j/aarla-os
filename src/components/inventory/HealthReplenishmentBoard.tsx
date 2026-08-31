"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { getInventoryPaceBoardAction } from "@/app/actions/inventory-os-actions";
import type { ReplenishmentItem } from "@/lib/domain/inventory-replenishment";
import { ReplenishmentPanel } from "@/components/inventory/ReplenishmentPanel";

type HealthRow = {
  productId: string;
  productTitle: string;
  variantId: string;
  variantLabel: string;
  studio: number;
  partner: number;
  healthLabel: string;
  healthAction: string;
  paceLabel: string;
  why: string[];
};

interface HealthReplenishmentBoardProps {
  aarlaLow: ReplenishmentItem[];
  partnerNeed: ReplenishmentItem[];
  globalLow: ReplenishmentItem[];
  onTransfer: (item: ReplenishmentItem) => void;
}

const ACTION_ORDER = [
  "replenish-now",
  "replenish-soon",
  "push-clear",
  "hold-replenishment",
  "do-not-replenish",
  "review-for-discontinuation",
  "watch",
  "healthy",
] as const;

function healthTone(action: string): "danger" | "warning" | "accent" | "info" | "success" | "neutral" {
  if (action === "replenish-now" || action === "review-for-discontinuation") return "danger";
  if (action === "replenish-soon" || action === "push-clear") return "warning";
  if (action === "hold-replenishment" || action === "do-not-replenish") return "info";
  if (action === "healthy") return "success";
  return "neutral";
}

export function HealthReplenishmentBoard({
  aarlaLow,
  partnerNeed,
  globalLow,
  onTransfer,
}: HealthReplenishmentBoardProps) {
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getInventoryPaceBoardAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows(result.data.rows as HealthRow[]);
      setError(null);
    });
  }, []);

  const attention = useMemo(
    () =>
      rows
        .filter((r) => r.healthAction !== "healthy")
        .sort(
          (a, b) =>
            ACTION_ORDER.indexOf(a.healthAction as (typeof ACTION_ORDER)[number]) -
            ACTION_ORDER.indexOf(b.healthAction as (typeof ACTION_ORDER)[number]),
        ),
    [rows],
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-xl text-deep-navy">Decision health</h2>
          <p className="text-sm text-charcoal/60 mt-0.5">
            Min-stock rules plus sales pace and aging. Manual DO_NOT_REPLENISH policies override
            automatic pressure.
          </p>
        </div>
        {pending ? <p className="text-sm text-charcoal/50">Loading health…</p> : null}
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        <DataTable
          rows={attention}
          rowKey={(r) => `${r.productId}:${r.variantId}`}
          emptyMessage="No health exceptions — coverage and pace look balanced."
          columns={[
            {
              key: "item",
              header: "Item",
              render: (r) => (
                <div>
                  <Link
                    href={`/inventory/products/${r.productId}`}
                    className="font-medium text-deep-navy hover:text-aarla-red"
                  >
                    {r.productTitle}
                  </Link>
                  <p className="text-xs text-charcoal/50">{r.variantLabel}</p>
                </div>
              ),
            },
            {
              key: "action",
              header: "Action",
              render: (r) => (
                <StatusChip label={r.healthLabel} tone={healthTone(r.healthAction)} />
              ),
            },
            {
              key: "pace",
              header: "Pace",
              render: (r) => <span className="text-sm">{r.paceLabel}</span>,
            },
            { key: "studio", header: "Studio", render: (r) => String(r.studio) },
            { key: "partner", header: "Partner", render: (r) => String(r.partner) },
            {
              key: "why",
              header: "Why",
              render: (r) => <p className="text-xs text-charcoal/65 max-w-xs">{r.why[0] ?? "—"}</p>,
            },
            {
              key: "open",
              header: "",
              render: (r) => (
                <Link href={`/inventory/products/${r.productId}`}>
                  <Button size="sm" variant="outline">
                    Open
                  </Button>
                </Link>
              ),
            },
          ]}
        />
      </section>

      <ReplenishmentPanel
        title="A. Aarla Low Stock"
        description="Studio stock has fallen below the configured minimum for these variants."
        items={aarlaLow}
        onTransfer={onTransfer}
        emptyMessage="Studio stock is healthy against every reorder rule."
      />
      <ReplenishmentPanel
        title="B. Partner Replenishment Needed"
        description="A specific partner's stock is below its partner-scoped minimum."
        items={partnerNeed}
        onTransfer={onTransfer}
        emptyMessage="No partner is below its replenishment threshold."
      />
      <ReplenishmentPanel
        title="C. Global Low Stock"
        description="Studio + partner stock combined is below the minimum — Shopify's reserved pool is never double-counted here."
        items={globalLow}
        onTransfer={onTransfer}
        emptyMessage="Global on-hand stock clears every reorder rule."
      />
    </div>
  );
}

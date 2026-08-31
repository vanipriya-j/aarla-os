"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { getInventoryPaceBoardAction } from "@/app/actions/inventory-os-actions";

type PaceRow = {
  productId: string;
  productTitle: string;
  category: string;
  variantId: string;
  variantLabel: string;
  studio: number;
  partner: number;
  reserved: number;
  paceLabel: string;
  healthLabel: string;
  healthAction: string;
  paceClass: string;
  why: string[];
  unitsSold30d: number;
  oldestAgeDays: number | null;
  valueAtCost: number | null;
  costIncomplete: boolean;
};

function paceTone(paceClass: string): "accent" | "success" | "warning" | "danger" | "info" | "neutral" {
  if (paceClass === "extremely-fast" || paceClass === "fast-mover") return "accent";
  if (paceClass === "consistent-performer" || paceClass === "healthy") return "success";
  if (paceClass === "slow-moving") return "warning";
  if (paceClass === "stagnant") return "danger";
  return "neutral";
}

export function SalesPaceBoard() {
  const [rows, setRows] = useState<PaceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getInventoryPaceBoardAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows(result.data.rows as PaceRow[]);
      setError(null);
    });
  }, []);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl text-deep-navy">Sales Pace</h2>
        <p className="text-sm text-charcoal/60 mt-0.5">
          Availability-adjusted velocity from receipt cycles × matched Shopify sales — not calendar
          dilution. Ledger remains the source of truth for stock.
        </p>
      </div>
      {pending ? <p className="text-sm text-charcoal/50">Loading pace board…</p> : null}
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      <DataTable
        rows={rows}
        rowKey={(r) => `${r.productId}:${r.variantId}`}
        emptyMessage="No paced variants yet — sync Shopify orders and receive stock to build cycles."
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
            key: "pace",
            header: "Pace",
            render: (r) => <StatusChip label={r.paceLabel} tone={paceTone(r.paceClass)} />,
          },
          {
            key: "health",
            header: "Health",
            render: (r) => <StatusChip label={r.healthLabel} tone="info" />,
          },
          { key: "studio", header: "Studio", render: (r) => String(r.studio) },
          { key: "partner", header: "Partner", render: (r) => String(r.partner) },
          { key: "sold30", header: "Sold 30d", render: (r) => String(r.unitsSold30d) },
          {
            key: "why",
            header: "Why",
            render: (r) => (
              <p className="text-xs text-charcoal/65 max-w-xs">{r.why[0] ?? "—"}</p>
            ),
          },
        ]}
      />
    </section>
  );
}

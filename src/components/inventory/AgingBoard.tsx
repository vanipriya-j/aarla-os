"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatINR } from "@/lib/domain";
import { AGE_BANDS, type AgeBand } from "@/lib/domain/inventory-aging";
import { getInventoryPaceBoardAction } from "@/app/actions/inventory-os-actions";

type AgingRow = {
  productId: string;
  productTitle: string;
  variantId: string;
  variantLabel: string;
  oldestAgeDays: number | null;
  valueAtCost: number | null;
  costIncomplete: boolean;
  ageBands: Record<AgeBand, number>;
  studio: number;
  partner: number;
};

export function AgingBoard() {
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getInventoryPaceBoardAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows(
        (result.data.rows as AgingRow[]).filter(
          (r) => (r.studio ?? 0) + (r.partner ?? 0) > 0 || (r.oldestAgeDays ?? 0) > 0,
        ),
      );
      setError(null);
    });
  }, []);

  const totals = useMemo(() => {
    const bands = Object.fromEntries(AGE_BANDS.map((b) => [b, 0])) as Record<AgeBand, number>;
    let capital = 0;
    let incomplete = 0;
    for (const r of rows) {
      for (const b of AGE_BANDS) bands[b] += r.ageBands?.[b] ?? 0;
      if (r.costIncomplete || r.valueAtCost == null) incomplete += 1;
      else capital += r.valueAtCost;
    }
    return { bands, capital, incomplete };
  }, [rows]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-deep-navy">Aging</h2>
        <p className="text-sm text-charcoal/60 mt-0.5">
          FIFO layers from ledger inbound dates — not product created-at. Capital at cost when cost is
          known.
        </p>
      </div>
      {pending ? <p className="text-sm text-charcoal/50">Loading aging…</p> : null}
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {AGE_BANDS.map((band) => (
          <div key={band} className="rounded-xl border border-border bg-pale-cream p-3">
            <p className="text-[11px] uppercase tracking-wider text-charcoal/55">{band} days</p>
            <p className="mt-1 font-display text-xl text-deep-navy">{totals.bands[band]}</p>
          </div>
        ))}
        <div className="rounded-xl border border-border bg-pale-cream p-3">
          <p className="text-[11px] uppercase tracking-wider text-charcoal/55">Capital at cost</p>
          <p className="mt-1 font-display text-xl text-deep-navy">{formatINR(totals.capital)}</p>
          {totals.incomplete ? (
            <p className="text-[11px] text-charcoal/50 mt-1">{totals.incomplete} missing cost</p>
          ) : null}
        </div>
      </div>

      <DataTable
        rows={[...rows].sort((a, b) => (b.oldestAgeDays ?? 0) - (a.oldestAgeDays ?? 0))}
        rowKey={(r) => `${r.productId}:${r.variantId}`}
        emptyMessage="No sellable inventory layers to age."
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
            key: "oldest",
            header: "Oldest",
            render: (r) =>
              r.oldestAgeDays == null ? (
                "—"
              ) : (
                <StatusChip
                  label={`${r.oldestAgeDays}d`}
                  tone={r.oldestAgeDays >= 90 ? "danger" : r.oldestAgeDays >= 60 ? "warning" : "info"}
                />
              ),
          },
          {
            key: "value",
            header: "At cost",
            render: (r) =>
              r.costIncomplete || r.valueAtCost == null ? (
                <span className="text-charcoal/45">Cost incomplete</span>
              ) : (
                formatINR(r.valueAtCost)
              ),
          },
          {
            key: "bands",
            header: "Bands",
            render: (r) => (
              <p className="text-xs text-charcoal/65">
                {AGE_BANDS.filter((b) => (r.ageBands?.[b] ?? 0) > 0)
                  .map((b) => `${b}:${r.ageBands[b]}`)
                  .join(" · ") || "—"}
              </p>
            ),
          },
        ]}
      />
    </section>
  );
}

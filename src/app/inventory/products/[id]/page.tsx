"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  clearDoNotReplenishPolicyAction,
  getInventoryProductInsightsAction,
  setDoNotReplenishPolicyAction,
  type DoNotReplenishReason,
} from "@/app/actions/inventory-os-actions";
import { variantsMatchingOption } from "@/lib/domain/inventory-availability";
import { formatINR } from "@/lib/domain";
import { ArrowLeft } from "lucide-react";

type InsightRow = {
  variantId: string;
  label: string;
  options: Record<string, string>;
  availability: {
    studio: number;
    partner: number;
    reserved: number;
    softReserved: number;
    studioAvailableNow: number;
    total: number;
    damaged: number;
    byLocation: Array<{
      locationId: string;
      locationName: string;
      kind: string;
      quantity: number;
    }>;
    partnerByName: Array<{ partnerName: string; locationId: string; quantity: number }>;
  };
  pace: {
    classification: string;
    why: string[];
    unitsSold30d: number;
    unitsSold90d: number;
    daysSinceLastSale: number | null;
    currentlyStockedOut: boolean;
    lastCycle: {
      velocityPerDay: number | null;
      daysToSellOut: number | null;
      sellThrough: number;
      soldOut: boolean;
    } | null;
  };
  aging: {
    oldestAgeDays: number | null;
    valueAtCost: number | null;
    costIncomplete: boolean;
    bands: Record<string, number>;
  };
  health: { action: string; why: string[] };
  paceLabel: string;
  healthLabel: string;
};

const POLICY_REASONS: { value: DoNotReplenishReason; label: string }[] = [
  { value: "poor_demand", label: "Poor demand" },
  { value: "old_collection", label: "Old collection" },
  { value: "low_margin", label: "Low margin" },
  { value: "production_difficulty", label: "Production difficulty" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "seasonal", label: "Seasonal" },
  { value: "replaced_by_new_product", label: "Replaced by new product" },
  { value: "other", label: "Other" },
];

export default function InventoryProductPage() {
  const params = useParams();
  const productId = String(params.id);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Product inventory");
  const [sku, setSku] = useState("");
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [sizeFilter, setSizeFilter] = useState<string | null>(null);
  const [policyReason, setPolicyReason] = useState<DoNotReplenishReason>("poor_demand");
  const [policyNote, setPolicyNote] = useState("");
  const [policyVariantId, setPolicyVariantId] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const result = await getInventoryProductInsightsAction(productId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle(result.data.product.title);
      setSku(result.data.product.sku);
      setInsights(result.data.insights as InsightRow[]);
      setError(null);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on product change
  }, [productId]);

  const sizes = useMemo(() => {
    const set = new Set<string>();
    for (const row of insights) {
      const size = row.options?.Size;
      if (size) set.add(size);
    }
    return Array.from(set).sort();
  }, [insights]);

  const visible = useMemo(() => {
    if (!sizeFilter) return insights;
    const allowed = new Set(
      variantsMatchingOption(
        insights.map((i) => ({
          id: i.variantId,
          label: i.label,
          sku: i.variantId,
          options: i.options,
        })),
        "Size",
        sizeFilter,
      ).map((v) => v.id),
    );
    return insights.filter((i) => allowed.has(i.variantId));
  }, [insights, sizeFilter]);

  const applyPolicy = () => {
    startTransition(async () => {
      const result = await setDoNotReplenishPolicyAction({
        productId,
        variantId: policyVariantId || null,
        reason: policyReason,
        note: policyNote || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setToast("DO_NOT_REPLENISH policy saved");
      load();
    });
  };

  const clearPolicy = () => {
    startTransition(async () => {
      const result = await clearDoNotReplenishPolicyAction({
        productId,
        variantId: policyVariantId || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setToast("Policy cleared");
      load();
    });
  };

  return (
    <>
      <Header
        title={title}
        subtitle={`${sku || productId} · Studio / partner / soft holds · sales pace · aging`}
        actions={
          <Link href="/inventory">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Inventory
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {pending && !insights.length ? (
          <p className="text-sm text-charcoal/50">Loading product inventory…</p>
        ) : null}
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {toast ? (
          <div className="rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
            {toast}
          </div>
        ) : null}

        {sizes.length ? (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs uppercase tracking-wider text-charcoal/50">By size</span>
            <button
              type="button"
              onClick={() => setSizeFilter(null)}
              className={`text-sm rounded-full px-3 py-1.5 border transition ${
                sizeFilter == null
                  ? "bg-aarla-red text-white border-aarla-red"
                  : "border-border bg-white text-charcoal/70"
              }`}
            >
              All
            </button>
            {sizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setSizeFilter(size)}
                className={`text-sm rounded-full px-3 py-1.5 border transition ${
                  sizeFilter === size
                    ? "bg-aarla-red text-white border-aarla-red"
                    : "border-border bg-white text-charcoal/70"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        ) : null}

        <DataTable
          rows={visible}
          rowKey={(r) => r.variantId}
          emptyMessage="No variants for this product."
          columns={[
            {
              key: "variant",
              header: "Variant",
              render: (r) => (
                <div>
                  <p className="font-medium text-deep-navy">{r.label}</p>
                  <p className="text-xs text-charcoal/50">
                    {[r.options?.Colour, r.options?.Size].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              ),
            },
            {
              key: "studio",
              header: "Studio avail",
              render: (r) => (
                <div>
                  <p className="font-medium">{r.availability.studioAvailableNow}</p>
                  <p className="text-[11px] text-charcoal/45">
                    ledger {r.availability.studio}
                    {r.availability.softReserved
                      ? ` − soft ${r.availability.softReserved}`
                      : ""}
                  </p>
                </div>
              ),
            },
            { key: "partner", header: "Partner", render: (r) => String(r.availability.partner) },
            {
              key: "reserved",
              header: "Reserved",
              render: (r) =>
                String(r.availability.reserved + r.availability.softReserved),
            },
            {
              key: "pace",
              header: "Pace",
              render: (r) => (
                <div>
                  <StatusChip label={r.paceLabel} tone="info" />
                  <p className="text-[11px] text-charcoal/50 mt-1">
                    {r.pace.lastCycle?.velocityPerDay != null
                      ? `~${r.pace.lastCycle.velocityPerDay.toFixed(1)}/day`
                      : `${r.pace.unitsSold30d} sold / 30d`}
                  </p>
                </div>
              ),
            },
            {
              key: "health",
              header: "Health",
              render: (r) => <StatusChip label={r.healthLabel} tone="accent" />,
            },
            {
              key: "age",
              header: "Oldest",
              render: (r) =>
                r.aging.oldestAgeDays == null ? "—" : `${r.aging.oldestAgeDays}d`,
            },
            {
              key: "cost",
              header: "At cost",
              render: (r) =>
                r.aging.costIncomplete || r.aging.valueAtCost == null
                  ? "—"
                  : formatINR(r.aging.valueAtCost),
            },
          ]}
        />

        {visible[0] ? (
          <section className="space-y-3">
            <h2 className="font-display text-xl text-deep-navy">Locations</h2>
            <DataTable
              rows={visible.flatMap((v) =>
                v.availability.byLocation
                  .filter((l) => l.quantity > 0)
                  .map((l) => ({
                    key: `${v.variantId}:${l.locationId}`,
                    variantLabel: v.label,
                    ...l,
                  })),
              )}
              rowKey={(r) => r.key}
              emptyMessage="No location balances for the filtered variants."
              columns={[
                { key: "variant", header: "Variant", render: (r) => r.variantLabel },
                {
                  key: "loc",
                  header: "Location",
                  render: (r) => (
                    <span>
                      {r.locationName}{" "}
                      <span className="text-xs text-charcoal/45">({r.kind})</span>
                    </span>
                  ),
                },
                { key: "qty", header: "Qty", render: (r) => String(r.quantity) },
              ]}
            />
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-pale-cream p-5 space-y-3">
          <h2 className="font-display text-xl text-deep-navy">Do not replenish</h2>
          <p className="text-sm text-charcoal/60">
            Manual business decision. Does not delete inventory or rewrite the ledger.
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm space-y-1">
              <span className="block text-charcoal/55">Variant (blank = product)</span>
              <select
                className="rounded-lg border border-border px-3 py-2 bg-white"
                value={policyVariantId}
                onChange={(e) => setPolicyVariantId(e.target.value)}
              >
                <option value="">Entire product</option>
                {insights.map((i) => (
                  <option key={i.variantId} value={i.variantId}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="block text-charcoal/55">Reason</span>
              <select
                className="rounded-lg border border-border px-3 py-2 bg-white"
                value={policyReason}
                onChange={(e) => setPolicyReason(e.target.value as DoNotReplenishReason)}
              >
                {POLICY_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1 flex-1 min-w-[12rem]">
              <span className="block text-charcoal/55">Note</span>
              <input
                className="w-full rounded-lg border border-border px-3 py-2 bg-white"
                value={policyNote}
                onChange={(e) => setPolicyNote(e.target.value)}
                placeholder="Optional context"
              />
            </label>
            <Button onClick={applyPolicy} disabled={pending}>
              Save policy
            </Button>
            <Button variant="outline" onClick={clearPolicy} disabled={pending}>
              Clear
            </Button>
          </div>
        </section>

        <p className="text-sm text-charcoal/55">
          Product journey &amp; registrations live on{" "}
          <Link href={`/products/${productId}`} className="text-aarla-red font-medium">
            the product page →
          </Link>
        </p>
      </main>
    </>
  );
}

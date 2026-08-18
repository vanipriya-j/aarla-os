"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  allocateToCampaignAction,
  getCampaignBoardAction,
  releaseAllocationAction,
  setCampaignStatusAction,
  updateCampaignAction,
  updateLinePlannedQuantityAction,
  upsertCampaignLineItemAction,
} from "@/app/actions/campaign-actions";
import { CampaignPlannerMatrix } from "@/components/campaigns/CampaignPlannerMatrix";
import { CampaignStatusChip } from "@/components/campaigns/CampaignStatusChip";
import { planningModeHelper } from "@/lib/domain/campaign-planner";
import type {
  CampaignBoard,
  CampaignPlanningMode,
  CampaignStatus,
} from "@/lib/domain/campaign-types";
import { formatINR } from "@/lib/domain";
import type { Product } from "@/lib/domain/types";

interface CampaignPlannerClientProps {
  initialBoard: CampaignBoard;
  products: Product[];
}

const STATUS_ACTIONS: Partial<Record<CampaignStatus, { label: string; next: CampaignStatus }[]>> = {
  DRAFT: [{ label: "Start inventory planning", next: "INVENTORY_PLANNING" }],
  INVENTORY_PLANNING: [
    { label: "Mark Ready", next: "READY" },
    { label: "Back to Draft", next: "DRAFT" },
  ],
  READY: [
    { label: "Go Live", next: "LIVE" },
    { label: "Back to planning", next: "INVENTORY_PLANNING" },
  ],
  LIVE: [
    { label: "Pause", next: "PAUSED" },
    { label: "Complete", next: "COMPLETED" },
  ],
  PAUSED: [
    { label: "Resume Live", next: "LIVE" },
    { label: "Back to planning", next: "INVENTORY_PLANNING" },
    { label: "Complete", next: "COMPLETED" },
  ],
};

export function CampaignPlannerClient({
  initialBoard,
  products,
}: CampaignPlannerClientProps) {
  const [board, setBoard] = useState(initialBoard);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<CampaignPlanningMode>("inventory_investment");
  const [productCode, setProductCode] = useState(products[0]?.id ?? "");
  const [variantCode, setVariantCode] = useState("");
  const [plannedQty, setPlannedQty] = useState("10");
  const [plannedAdSpend, setPlannedAdSpend] = useState(
    String(initialBoard.campaign.plannedAdSpend || ""),
  );

  const modeHelp = planningModeHelper(mode);
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productCode),
    [products, productCode],
  );

  const matrixGroups = useMemo(() => {
    const byProduct = new Map<string, CampaignBoard["lines"]>();
    for (const line of board.lines) {
      if (line.presentation === "list") continue;
      const list = byProduct.get(line.lineItem.productCode) ?? [];
      list.push(line);
      byProduct.set(line.lineItem.productCode, list);
    }
    return Array.from(byProduct.entries())
      .map(([code, lines]) => ({
        product: products.find((p) => p.id === code),
        lines,
      }))
      .filter((g): g is { product: Product; lines: CampaignBoard["lines"] } => Boolean(g.product));
  }, [board, products]);

  const listLines = board.lines.filter((l) => l.presentation === "list");

  const reload = useCallback((next: CampaignBoard) => {
    setBoard(next);
    setPlannedAdSpend(String(next.campaign.plannedAdSpend || ""));
  }, []);

  function transition(next: CampaignStatus) {
    startTransition(async () => {
      setError(null);
      const res = await setCampaignStatusAction(board.campaign.id, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reload(res.data);
    });
  }

  function saveAdSpend() {
    startTransition(async () => {
      setError(null);
      const res = await updateCampaignAction(board.campaign.id, {
        plannedAdSpend: Number(plannedAdSpend) || 0,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const refreshed = await getCampaignBoardAction(board.campaign.id);
      if (!refreshed.ok) {
        setError(refreshed.error);
        return;
      }
      reload(refreshed.data);
    });
  }

  function addLine(e: React.FormEvent) {
    e.preventDefault();
    if (!productCode) return;
    startTransition(async () => {
      setError(null);
      const res = await upsertCampaignLineItemAction({
        campaignId: board.campaign.id,
        productCode,
        variantCode: variantCode || null,
        plannedQuantity: Number(plannedQty) || 0,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reload(res.data);
    });
  }

  function setPlanned(
    productCode: string,
    variantCode: string | null,
    plannedQuantity: number,
  ) {
    startTransition(async () => {
      setError(null);
      const res = await updateLinePlannedQuantityAction({
        campaignId: board.campaign.id,
        productCode,
        variantCode,
        plannedQuantity,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reload(res.data);
    });
  }

  function allocate(
    productCode: string,
    variantCode: string | null,
    quantity: number,
  ) {
    startTransition(async () => {
      setError(null);
      const res = await allocateToCampaignAction({
        campaignId: board.campaign.id,
        productCode,
        variantCode,
        quantity,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reload(res.data);
    });
  }

  function release(productCode: string, variantCode: string | null) {
    startTransition(async () => {
      setError(null);
      const res = await releaseAllocationAction({
        campaignId: board.campaign.id,
        productCode,
        variantCode,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reload(res.data);
    });
  }

  const { campaign, totals, readiness } = board;
  const actions = STATUS_ACTIONS[campaign.status] ?? [];

  return (
    <div className="space-y-8" data-testid="campaign-planner">
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-display text-2xl text-deep-navy">{campaign.name}</p>
          <p className="text-sm text-charcoal/55 mt-1">
            {campaign.startDate} → {campaign.endDate}
            {" · "}
            Soft allocation only — no stock movement on allocate
          </p>
          <div className="mt-2">
            <CampaignStatusChip status={campaign.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.next}
              type="button"
              disabled={pending || (a.next === "READY" && !board.canMarkReady)}
              onClick={() => transition(a.next)}
              className={`rounded-full px-3 py-1.5 text-sm disabled:opacity-50 ${
                a.next === "LIVE" || a.next === "READY"
                  ? "bg-deep-navy text-white"
                  : "border border-border bg-white"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </section>

      {/* Planning mode tabs — helper text + highlight only */}
      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["ad_budget", "Ad Budget"],
              ["revenue_target", "Revenue Target"],
              ["inventory_investment", "Inventory Investment"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`rounded-full px-3 py-1.5 text-sm border ${
                mode === key
                  ? "border-deep-navy bg-deep-navy text-white"
                  : "border-border bg-white text-deep-navy"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-charcoal/60">{modeHelp.helper}</p>
      </section>

      {/* Totals */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            ["investment", "Investment", totals.investment],
            ["potentialRevenue", "Potential Revenue", totals.potentialRevenue],
            ["grossProfitBeforeAds", "Gross Profit before Ads", totals.grossProfitBeforeAds],
            ["plannedAdSpend", "Planned Ad Spend", totals.plannedAdSpend],
            ["contributionAfterAds", "Contribution after Ads", totals.contributionAfterAds],
          ] as const
        ).map(([key, label, value]) => {
          const highlight =
            (modeHelp.highlight === "investment" && key === "investment") ||
            (modeHelp.highlight === "plannedAdSpend" && key === "plannedAdSpend") ||
            (modeHelp.highlight === "targetRevenue" && key === "potentialRevenue");
          return (
            <div
              key={key}
              className={`rounded-xl border px-4 py-3 ${
                highlight ? "border-aarla-red bg-aarla-red/5" : "border-border bg-white"
              }`}
            >
              <p className="text-xs uppercase tracking-wider text-charcoal/50">{label}</p>
              <p className="font-display text-xl text-deep-navy mt-1">{formatINR(value)}</p>
            </div>
          );
        })}
      </section>

      {mode === "ad_budget" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">Planned ad spend (₹)</span>
            <input
              type="number"
              min={0}
              value={plannedAdSpend}
              onChange={(e) => setPlannedAdSpend(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={saveAdSpend}
            className="rounded-full bg-deep-navy text-white px-3 py-2 text-sm disabled:opacity-50"
          >
            Save ad spend
          </button>
        </div>
      ) : null}

      {mode === "revenue_target" ? (
        <p className="text-sm text-charcoal/55">
          Targets: revenue{" "}
          {campaign.targetRevenue != null ? formatINR(campaign.targetRevenue) : "—"}
          {" · "}
          orders {campaign.targetOrders ?? "—"}
          {" · "}
          AOV {campaign.targetAov != null ? formatINR(campaign.targetAov) : "—"}
        </p>
      ) : null}

      {/* Readiness */}
      <section className="rounded-xl border border-border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-lg text-deep-navy">Inventory readiness</h2>
          <p className="text-sm text-charcoal/55">
            Required {readiness.required} · Ready {readiness.ready} · Missing{" "}
            <span className={readiness.missing > 0 ? "text-aarla-red" : ""}>
              {readiness.missing}
            </span>{" "}
            · {readiness.readinessPct}%
          </p>
        </div>
        <div className="h-2 rounded-full bg-soft-beige overflow-hidden">
          <div
            className="h-full rounded-full bg-aarla-red/80 transition-all"
            style={{ width: `${Math.min(100, readiness.readinessPct)}%` }}
          />
        </div>
        {readiness.missing > 0 ? (
          <p className="text-sm text-charcoal/60">
            Gap?{" "}
            <Link href="/manufacture" className="text-aarla-red hover:underline">
              Manufacture / Reorder
            </Link>
            {" · "}
            <Link
              href="/inventory?tab=replenishment"
              className="text-aarla-red hover:underline"
            >
              Inventory replenishment
            </Link>
          </p>
        ) : null}
      </section>

      {board.attributedSales ? (
        <section className="rounded-xl border border-border bg-white p-4">
          <h2 className="font-display text-lg text-deep-navy">Live sales</h2>
          <p className="text-xs text-charcoal/50 mt-1">{board.attributedSales.label}</p>
          <div className="mt-3 flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-charcoal/50">Revenue</p>
              <p className="font-display text-xl text-deep-navy">
                {formatINR(board.attributedSales.revenue)}
              </p>
            </div>
            <div>
              <p className="text-charcoal/50">Units</p>
              <p className="font-display text-xl text-deep-navy">
                {board.attributedSales.units}
              </p>
            </div>
            <div>
              <p className="text-charcoal/50">Orders</p>
              <p className="font-display text-xl text-deep-navy">
                {board.attributedSales.orderCount}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Add line */}
      <section className="rounded-xl border border-border bg-white p-4 space-y-3">
        <h2 className="font-display text-lg text-deep-navy">Add product line</h2>
        <form onSubmit={addLine} className="flex flex-wrap items-end gap-3">
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">Product</span>
            <select
              value={productCode}
              onChange={(e) => {
                setProductCode(e.target.value);
                setVariantCode("");
              }}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm min-w-[12rem]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">Variant</span>
            <select
              value={variantCode}
              onChange={(e) => setVariantCode(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm min-w-[10rem]"
            >
              <option value="">Product-level</option>
              {(selectedProduct?.variants ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">Planned qty</span>
            <input
              type="number"
              min={0}
              value={plannedQty}
              onChange={(e) => setPlannedQty(e.target.value)}
              className="w-24 rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !productCode}
            className="rounded-full bg-aarla-red text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            Add line
          </button>
        </form>
      </section>

      {/* Matrix products */}
      {matrixGroups.map(({ product, lines }) => (
        <section key={product.id} className="space-y-3">
          <h2 className="font-display text-lg text-deep-navy">{product.title}</h2>
          <CampaignPlannerMatrix
            product={product}
            lines={lines}
            onAllocate={(variantId, need) => {
              if (need > 0) allocate(product.id, variantId, need);
            }}
          />
          <div className="space-y-2">
            {lines.map((line) => (
              <LineControls
                key={line.lineItem.id}
                line={line}
                pending={pending}
                onPlanned={(qty) =>
                  setPlanned(line.lineItem.productCode, line.lineItem.variantCode, qty)
                }
                onAllocate={(qty) =>
                  allocate(line.lineItem.productCode, line.lineItem.variantCode, qty)
                }
                onRelease={() =>
                  release(line.lineItem.productCode, line.lineItem.variantCode)
                }
              />
            ))}
          </div>
        </section>
      ))}

      {/* List presentation lines */}
      {listLines.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg text-deep-navy">Lines</h2>
          <div className="space-y-2">
            {listLines.map((line) => (
              <LineControls
                key={line.lineItem.id}
                line={line}
                pending={pending}
                showTitle
                onPlanned={(qty) =>
                  setPlanned(line.lineItem.productCode, line.lineItem.variantCode, qty)
                }
                onAllocate={(qty) =>
                  allocate(line.lineItem.productCode, line.lineItem.variantCode, qty)
                }
                onRelease={() =>
                  release(line.lineItem.productCode, line.lineItem.variantCode)
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {board.lines.length === 0 ? (
        <p className="text-sm text-charcoal/55">Add catalog products to start planning.</p>
      ) : null}
    </div>
  );
}

function LineControls({
  line,
  pending,
  showTitle,
  onPlanned,
  onAllocate,
  onRelease,
}: {
  line: CampaignBoard["lines"][number];
  pending: boolean;
  showTitle?: boolean;
  onPlanned: (qty: number) => void;
  onAllocate: (qty: number) => void;
  onRelease: () => void;
}) {
  const [qty, setQty] = useState(String(line.planned));
  const [allocQty, setAllocQty] = useState(
    String(line.need > 0 ? line.need : Math.max(1, line.planned || 1)),
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white px-4 py-3">
      <div className="min-w-[10rem] flex-1">
        {showTitle ? (
          <p className="font-medium text-deep-navy">
            {line.productTitle}
            {line.variantLabel ? ` · ${line.variantLabel}` : ""}
          </p>
        ) : (
          <p className="text-sm text-deep-navy">{line.variantLabel ?? "Product-level"}</p>
        )}
        <p className="text-xs text-charcoal/50 mt-0.5">
          Current {line.allocated} · Need {line.need} · Gap{" "}
          <span className={line.gap > 0 ? "text-aarla-red" : ""}>{line.gap}</span>
          {" · "}
          Soft avail {line.studioAvailable}
        </p>
      </div>
      <label className="text-xs space-y-1">
        <span className="block text-charcoal/45">Planned</span>
        <input
          type="number"
          min={0}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => {
            const n = Math.max(0, Math.floor(Number(qty) || 0));
            if (n !== line.planned) onPlanned(n);
          }}
          className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-xs space-y-1">
        <span className="block text-charcoal/45">Allocate</span>
        <input
          type="number"
          min={1}
          value={allocQty}
          onChange={(e) => setAllocQty(e.target.value)}
          className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() => onAllocate(Math.max(1, Math.floor(Number(allocQty) || 1)))}
        className="rounded-full bg-deep-navy text-white px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Allocate
      </button>
      {line.allocated > 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={onRelease}
          className="rounded-full border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Release
        </button>
      ) : null}
      {line.gap > 0 ? (
        <span className="text-xs text-aarla-red">
          <Link href="/manufacture" className="hover:underline">
            Manufacture
          </Link>
          {" / "}
          <Link href="/inventory?tab=replenishment" className="hover:underline">
            Replenish
          </Link>
        </span>
      ) : null}
    </div>
  );
}

"use client";

import { useAppLedger } from "@/lib/client/use-app-data";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  StockCatalogPanel,
  type StockCatalogSelection,
} from "@/components/inventory/StockCatalogPanel";
import { VariantStockDetail } from "@/components/inventory/VariantStockDetail";
import {
  TransferStockModal,
  type TransferStockSubmitInput,
} from "@/components/inventory/TransferStockModal";
import { AdjustStockModal, type AdjustStockSubmitInput } from "@/components/inventory/AdjustStockModal";
import { ReplenishmentPanel } from "@/components/inventory/ReplenishmentPanel";
import { ShopifyCatalogSyncButton } from "@/components/inventory/ShopifyCatalogSyncButton";
import { DEFAULT_INVENTORY_LOC, computeReplenishment } from "@/lib/domain";
import type { ReplenishmentItem } from "@/lib/domain/inventory-replenishment";
import {
  manufactureReorderHref,
  suggestedReorderQty,
} from "@/lib/domain/manufacture-reorder-link";

type Tab = "stock" | "replenishment" | "locations" | "movements";

const TAB_ALIASES: Record<string, Tab> = {
  products: "stock",
  batches: "locations",
};

function tabFromParam(value: string | null): Tab {
  if (!value) return "stock";
  if (value === "stock" || value === "replenishment" || value === "locations" || value === "movements") {
    return value;
  }
  return TAB_ALIASES[value] ?? "stock";
}

interface TransferContext {
  productId: string;
  variantId?: string;
  productTitle: string;
  variantLabel?: string;
  defaultFromLocationId?: string;
  defaultToLocationId?: string;
}

function InventoryInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(tabFromParam(searchParams.get("tab")));
  const {
    movements,
    hydrated,
    error,
    products,
    locations,
    partners,
    batches,
    vendors,
    reorderRules,
    transferStock,
    adjustStock,
  } = useAppLedger();

  // Re-load ledger after catalog sync by soft refresh.
  const reload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  const [selection, setSelection] = useState<StockCatalogSelection | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [transferCtx, setTransferCtx] = useState<TransferContext | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const productTitle = (id: string) => products.find((p) => p.id === id)?.title ?? id;
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;

  const tabs: { id: Tab; label: string }[] = [
    { id: "stock", label: "Stock" },
    { id: "replenishment", label: "Replenishment" },
    { id: "locations", label: "Locations" },
    { id: "movements", label: "Movement Ledger" },
  ];

  const replenishmentItems = useMemo(
    () =>
      computeReplenishment({
        products,
        movements,
        locations,
        partners,
        rules: reorderRules,
      }),
    [products, movements, locations, partners, reorderRules],
  );
  const aarlaLow = replenishmentItems.filter((i) => i.kind === "aarla-low");
  const partnerNeed = replenishmentItems.filter((i) => i.kind === "partner-need");
  const globalLow = replenishmentItems.filter((i) => i.kind === "global-low");

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2800);
  };

  const openDetail = (sel: StockCatalogSelection) => {
    setSelection(sel);
    setDetailOpen(true);
  };

  const openTransferFromDetail = () => {
    if (!selection) return;
    setDetailOpen(false);
    setTransferCtx({
      productId: selection.product.id,
      variantId: selection.cell.variantId,
      productTitle: selection.product.title,
      variantLabel: selection.variantLabel,
      defaultFromLocationId: DEFAULT_INVENTORY_LOC.studio,
    });
  };

  const openAdjustFromDetail = () => {
    if (!selection) return;
    setDetailOpen(false);
    setAdjustOpen(true);
  };

  const openTransferForReplenishment = (item: ReplenishmentItem) => {
    const partnerLoc = item.partnerId
      ? locations.find((l) => l.partnerId === item.partnerId)
      : undefined;
    const defaultFromLocationId =
      item.kind === "partner-need" ? DEFAULT_INVENTORY_LOC.studio : partnerLoc?.id;
    const defaultToLocationId =
      item.kind === "partner-need" ? partnerLoc?.id : DEFAULT_INVENTORY_LOC.studio;
    setTransferCtx({
      productId: item.productId,
      variantId: item.variantId,
      productTitle: item.label,
      defaultFromLocationId,
      defaultToLocationId,
    });
  };

  const handleTransferConfirm = async (input: TransferStockSubmitInput) => {
    if (!transferCtx) return;
    const result = await transferStock({
      productId: transferCtx.productId,
      variantId: transferCtx.variantId,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      quantity: input.quantity,
      notes: input.notes,
    });
    showToast(
      result
        ? `Transfer posted: ${transferCtx.productTitle} ×${input.quantity}`
        : "Transfer failed — check available stock at the source location.",
    );
    setTransferCtx(null);
  };

  const handleAdjustConfirm = async (input: AdjustStockSubmitInput) => {
    if (!selection) return;
    const result = await adjustStock({
      productId: selection.product.id,
      variantId: selection.cell.variantId,
      locationId: input.locationId,
      systemQty: input.systemQty,
      physicalQty: input.physicalQty,
      reason: input.reason,
      notes: input.notes,
    });
    showToast(
      result
        ? `Adjustment posted for ${selection.product.title} — ${selection.variantLabel}`
        : "Adjustment failed — the delta exceeds known stock at that location.",
    );
    setAdjustOpen(false);
  };

  const transferLocations = locations.filter((l) =>
    ["Studio", "Partner", "Channel", "Hold"].includes(l.kind),
  );
  const adjustLocations = transferLocations;

  return (
    <>
      <Header
        title="Inventory"
        subtitle="Balances are derived from the Stock Movement Ledger — the single source of truth."
        actions={<ShopifyCatalogSyncButton onDone={reload} />}
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`text-sm rounded-full px-3 py-1.5 border transition ${
                tab === t.id
                  ? "bg-aarla-red text-white border-aarla-red"
                  : "border-border bg-white text-charcoal/70 hover:border-aarla-red/40"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!hydrated ? <p className="text-sm text-charcoal/50">Loading ledger…</p> : null}
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {toast ? (
          <div className="rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
            {toast}
          </div>
        ) : null}

        {tab === "stock" ? (
          <div className="space-y-4">
            {hydrated && !products.length ? (
              <div className="rounded-xl border border-border bg-pale-cream p-5 space-y-3 text-sm text-charcoal/70">
                <p className="font-medium text-deep-navy">No products in the Aarla catalog yet</p>
                <p>
                  1) Sync catalog from Shopify. 2) Import base inventory once (Shopify available →
                  Studio opening receipts). After that manage with Receive / Transfer.
                </p>
                <ShopifyCatalogSyncButton onDone={reload} />
              </div>
            ) : (
              <StockCatalogPanel
                products={products}
                movements={movements}
                locations={locations}
                reorderRules={reorderRules}
                onSelectVariant={openDetail}
              />
            )}
          </div>
        ) : null}

        {tab === "replenishment" ? (
          <div className="space-y-8">
            <ReplenishmentPanel
              title="A. Aarla Low Stock"
              description="Studio stock has fallen below the configured minimum for these variants."
              items={aarlaLow}
              onTransfer={openTransferForReplenishment}
              emptyMessage="Studio stock is healthy against every reorder rule."
              needsFilter="low"
            />
            <ReplenishmentPanel
              title="B. Partner Replenishment Needed"
              description="A specific partner's stock is below its partner-scoped minimum."
              items={partnerNeed}
              onTransfer={openTransferForReplenishment}
              emptyMessage="No partner is below its replenishment threshold."
            />
            <ReplenishmentPanel
              title="C. Global Low Stock"
              description="Studio + partner stock combined is below the minimum — Shopify's reserved pool is never double-counted here."
              items={globalLow}
              onTransfer={openTransferForReplenishment}
              emptyMessage="Global on-hand stock clears every reorder rule."
              needsFilter="low"
            />
          </div>
        ) : null}

        {tab === "locations" ? (
          <div className="space-y-8">
            <div className="grid md:grid-cols-2 gap-4">
              {locations
                .filter((l) => !["loc-external", "loc-sold"].includes(l.id))
                .map((loc) => {
                  const inbound = movements.filter((m) => m.toLocationId === loc.id);
                  const units = inbound.reduce((s, m) => s + m.quantity, 0);
                  return (
                    <div key={loc.id} className="card-surface p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-display text-xl text-deep-navy">{loc.name}</h3>
                          <p className="text-xs text-charcoal/55 mt-1">{loc.kind}</p>
                        </div>
                        <StatusChip label={`${units} moved in`} tone="info" />
                      </div>
                      {loc.partnerId ? (
                        <Link
                          href="/partners"
                          className="inline-block mt-3 text-sm text-aarla-red font-medium"
                        >
                          Open partner →
                        </Link>
                      ) : null}
                    </div>
                  );
                })}
            </div>

            <div>
              <h2 className="font-display text-xl text-deep-navy mb-3">Batches</h2>
              <DataTable
                rows={batches}
                rowKey={(r) => r.id}
                columns={[
                  {
                    key: "batch",
                    header: "Batch",
                    render: (r) => <span className="font-medium text-deep-navy">{r.batchNumber}</span>,
                  },
                  {
                    key: "product",
                    header: "Product",
                    render: (r) => (
                      <Link href={`/products/${r.productId}`} className="hover:text-aarla-red">
                        {productTitle(r.productId)}
                      </Link>
                    ),
                  },
                  { key: "vendor", header: "Vendor", render: (r) => vendorName(r.vendorId) },
                  { key: "mfg", header: "Manufactured", render: (r) => r.manufactureDate },
                  { key: "recv", header: "Received", render: (r) => r.receivedDate || "—" },
                  { key: "qty", header: "Produced", render: (r) => String(r.quantityProduced) },
                  { key: "ok", header: "Accepted", render: (r) => String(r.accepted) },
                  {
                    key: "dmg",
                    header: "Damaged",
                    render: (r) => (
                      <StatusChip label={String(r.damaged)} tone={r.damaged ? "danger" : "success"} />
                    ),
                  },
                ]}
              />
            </div>
          </div>
        ) : null}

        {tab === "movements" ? (
          <DataTable
            rows={[...movements].sort((a, b) => b.date.localeCompare(a.date))}
            rowKey={(r) => r.id}
            columns={[
              { key: "date", header: "Date", render: (r) => r.date },
              {
                key: "product",
                header: "Product",
                render: (r) => (
                  <Link href={`/products/${r.productId}`} className="hover:text-aarla-red">
                    {productTitle(r.productId)}
                  </Link>
                ),
              },
              {
                key: "variant",
                header: "Variant",
                render: (r) =>
                  r.variantId
                    ? products
                        .find((p) => p.id === r.productId)
                        ?.variants.find((v) => v.id === r.variantId)?.label ?? r.variantId
                    : "—",
              },
              {
                key: "batch",
                header: "Batch",
                render: (r) => batches.find((b) => b.id === r.batchId)?.batchNumber ?? "—",
              },
              { key: "qty", header: "Qty", render: (r) => String(r.quantity) },
              { key: "from", header: "From", render: (r) => locationName(r.fromLocationId) },
              { key: "to", header: "To", render: (r) => locationName(r.toLocationId) },
              {
                key: "type",
                header: "Type",
                render: (r) => <StatusChip label={r.movementType} tone="info" />,
              },
              { key: "ref", header: "Reference", render: (r) => r.reference },
            ]}
          />
        ) : null}
      </main>

      <VariantStockDetail
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        productTitle={selection?.product.title ?? ""}
        variantLabel={selection?.variantLabel ?? ""}
        cell={selection?.cell ?? null}
        onTransfer={openTransferFromDetail}
        onAdjust={openAdjustFromDetail}
        reorderHref={
          selection
            ? manufactureReorderHref({
                productId: selection.product.id,
                variantId: selection.cell.variantId,
                quantity: suggestedReorderQty(selection.cell.total),
                label:
                  selection.variantLabel && selection.variantLabel !== "Default"
                    ? `${selection.product.title} / ${selection.variantLabel}`
                    : selection.product.title,
              })
            : null
        }
      />

      {transferCtx ? (
        <TransferStockModal
          open
          onClose={() => setTransferCtx(null)}
          productTitle={transferCtx.productTitle}
          variantLabel={transferCtx.variantLabel}
          locations={transferLocations}
          defaultFromLocationId={transferCtx.defaultFromLocationId}
          defaultToLocationId={transferCtx.defaultToLocationId}
          onConfirm={handleTransferConfirm}
        />
      ) : null}

      {adjustOpen && selection ? (
        <AdjustStockModal
          open
          onClose={() => setAdjustOpen(false)}
          productTitle={selection.product.title}
          variantLabel={selection.variantLabel}
          cell={selection.cell}
          locations={adjustLocations}
          defaultLocationId={DEFAULT_INVENTORY_LOC.studio}
          onConfirm={handleAdjustConfirm}
        />
      ) : null}
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<Header title="Inventory" subtitle="Loading…" />}>
      <InventoryInner />
    </Suspense>
  );
}

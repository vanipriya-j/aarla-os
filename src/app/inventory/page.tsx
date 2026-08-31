"use client";

import { useAppLedger } from "@/lib/client/use-app-data";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { StockMatrix } from "@/components/inventory/StockMatrix";
import { VariantStockDetail } from "@/components/inventory/VariantStockDetail";
import {
  TransferStockModal,
  type TransferStockSubmitInput,
} from "@/components/inventory/TransferStockModal";
import { AdjustStockModal, type AdjustStockSubmitInput } from "@/components/inventory/AdjustStockModal";
import { SalesPaceBoard } from "@/components/inventory/SalesPaceBoard";
import { AgingBoard } from "@/components/inventory/AgingBoard";
import { PartnerStockBoard, type PartnerStockRow } from "@/components/inventory/PartnerStockBoard";
import { ReconcileBoard } from "@/components/inventory/ReconcileBoard";
import { HealthReplenishmentBoard } from "@/components/inventory/HealthReplenishmentBoard";
import {
  DEFAULT_INVENTORY_LOC,
  buildApparelMatrix,
  buildArtMatrix,
  computeReplenishment,
  deriveVariantTotals,
  listVariantRows,
  resolvePresentation,
} from "@/lib/domain";
import type { ReplenishmentItem } from "@/lib/domain/inventory-replenishment";
import type { Product, ReorderRule, VariantStockCell } from "@/lib/domain/types";

type Tab =
  | "stock"
  | "pace"
  | "replenishment"
  | "aging"
  | "locations"
  | "partners"
  | "transfers"
  | "reconcile"
  | "movements";

const TAB_ALIASES: Record<string, Tab> = {
  products: "stock",
  batches: "locations",
  "sales-pace": "pace",
  "partner-stock": "partners",
};

const VALID_TABS: Tab[] = [
  "stock",
  "pace",
  "replenishment",
  "aging",
  "locations",
  "partners",
  "transfers",
  "reconcile",
  "movements",
];

function tabFromParam(value: string | null): Tab {
  if (!value) return "stock";
  if ((VALID_TABS as string[]).includes(value)) return value as Tab;
  return TAB_ALIASES[value] ?? "stock";
}

/** Minimum-stock rule for a variant — falls back to a product-level (no-variant) rule. */
function minQtyFor(rules: ReorderRule[], productId: string, variantId: string): number | undefined {
  const exact = rules.find(
    (r) => !r.partnerId && r.productId === productId && r.variantId === variantId,
  );
  if (exact) return exact.minQuantity;
  const productLevel = rules.find((r) => !r.partnerId && r.productId === productId && !r.variantId);
  return productLevel?.minQuantity;
}

interface StockSelection {
  product: Product;
  cell: VariantStockCell;
  variantLabel: string;
}

interface TransferContext {
  productId: string;
  variantId?: string;
  productTitle: string;
  variantLabel?: string;
  defaultFromLocationId?: string;
  defaultToLocationId?: string;
}

interface ProductStockBlockProps {
  product: Product;
  movements: ReturnType<typeof useAppLedger>["movements"];
  locations: ReturnType<typeof useAppLedger>["locations"];
  reorderRules: ReorderRule[];
  onSelectVariant: (selection: StockSelection) => void;
}

function ProductStockBlock({
  product,
  movements,
  locations,
  reorderRules,
  onSelectVariant,
}: ProductStockBlockProps) {
  const cells = useMemo(
    () => deriveVariantTotals(movements, product.id, product.variants, locations),
    [movements, product, locations],
  );
  const presentation = resolvePresentation(product);
  const lowStockVariantIds = useMemo(() => {
    const set = new Set<string>();
    for (const cell of cells) {
      const min = minQtyFor(reorderRules, product.id, cell.variantId);
      if (min !== undefined && cell.total < min) set.add(cell.variantId);
    }
    return set;
  }, [cells, reorderRules, product.id]);

  const variantLabelFor = (variantId: string) =>
    product.variants.find((v) => v.id === variantId)?.label ?? variantId;

  const handleCellClick = (cell: VariantStockCell) => {
    onSelectVariant({ product, cell, variantLabel: variantLabelFor(cell.variantId) });
  };

  return (
    <div className="space-y-2">
      <div>
        <Link
          href={`/inventory/products/${product.id}`}
          className="font-medium text-deep-navy hover:text-aarla-red"
        >
          {product.title}
        </Link>
        <p className="text-xs text-charcoal/50">{product.sku}</p>
      </div>

      {presentation === "matrix-apparel" ? (
        <StockMatrix
          rows={buildApparelMatrix(product, cells)}
          rowHeader="Colour"
          columnHeader="Size"
          onCellClick={handleCellClick}
          lowStockVariantIds={lowStockVariantIds}
        />
      ) : presentation === "matrix-art" ? (
        <StockMatrix
          rows={buildArtMatrix(product, cells)}
          rowHeader="Design"
          columnHeader="Format"
          onCellClick={handleCellClick}
          lowStockVariantIds={lowStockVariantIds}
        />
      ) : (
        <DataTable
          rows={listVariantRows(product, cells)}
          rowKey={(r) => r.variantId}
          onRowClick={(r) => (r.cell ? handleCellClick(r.cell) : undefined)}
          columns={[
            {
              key: "variant",
              header: "Variant",
              render: (r) => <span className="font-medium text-deep-navy">{r.label}</span>,
            },
            { key: "sku", header: "SKU", render: (r) => r.sku },
            { key: "studio", header: "Studio", render: (r) => String(r.cell?.studio ?? 0) },
            { key: "partner", header: "Partner", render: (r) => String(r.cell?.partner ?? 0) },
            { key: "channel", header: "Channel", render: (r) => String(r.cell?.channel ?? 0) },
            { key: "damaged", header: "Damaged", render: (r) => String(r.cell?.damaged ?? 0) },
            {
              key: "total",
              header: "Total",
              render: (r) => (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-deep-navy">{r.cell?.total ?? 0}</span>
                  {lowStockVariantIds.has(r.variantId) ? (
                    <StatusChip label="Low stock" tone="danger" />
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
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

  const [selection, setSelection] = useState<StockSelection | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [transferCtx, setTransferCtx] = useState<TransferContext | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const productTitle = (id: string) => products.find((p) => p.id === id)?.title ?? id;
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;

  const tabs: { id: Tab; label: string }[] = [
    { id: "stock", label: "Stock" },
    { id: "pace", label: "Sales Pace" },
    { id: "replenishment", label: "Replenishment" },
    { id: "aging", label: "Aging" },
    { id: "locations", label: "Locations" },
    { id: "partners", label: "Partner Stock" },
    { id: "transfers", label: "Transfers" },
    { id: "reconcile", label: "Reconcile" },
    { id: "movements", label: "Movements" },
  ];

  const productsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [products]);

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

  const openDetail = (sel: StockSelection) => {
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

  const openTransferFromPartner = (row: PartnerStockRow) => {
    setTransferCtx({
      productId: row.productId,
      variantId: row.variantId,
      productTitle: `${row.productTitle} — ${row.variantLabel}`,
      variantLabel: row.variantLabel,
      defaultFromLocationId: row.locationId,
      defaultToLocationId: DEFAULT_INVENTORY_LOC.studio,
    });
  };

  const transferMovements = useMemo(
    () =>
      [...movements]
        .filter((m) => m.movementType === "Transfer")
        .sort((a, b) => b.date.localeCompare(a.date)),
    [movements],
  );

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
        subtitle="Operating inventory — ledger balances, sales pace, aging, partner stock, and reconciliation."
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
          <div className="space-y-8">
            {hydrated && !products.length ? (
              <p className="text-sm text-charcoal/55">
                No products in the catalog yet. Run /setup if this environment is empty.
              </p>
            ) : null}
            {productsByCategory.map(([category, categoryProducts]) => (
              <section key={category} className="space-y-4">
                <h2 className="font-display text-xl text-deep-navy">{category}</h2>
                <div className="space-y-6">
                  {categoryProducts.map((product) => (
                    <ProductStockBlock
                      key={product.id}
                      product={product}
                      movements={movements}
                      locations={locations}
                      reorderRules={reorderRules}
                      onSelectVariant={openDetail}
                    />
                  ))}
                </div>
              </section>
            ))}
            {products.length ? (
              <div className="card-surface-pale p-4 text-sm text-charcoal/65">
                Open a product for By Size drill-down, pace, and DO_NOT_REPLENISH — e.g.{" "}
                <Link
                  href="/inventory/products/prod-kolam-bottle"
                  className="text-aarla-red font-medium"
                >
                  Kolam Bottle →
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "pace" ? <SalesPaceBoard /> : null}

        {tab === "replenishment" ? (
          <HealthReplenishmentBoard
            aarlaLow={aarlaLow}
            partnerNeed={partnerNeed}
            globalLow={globalLow}
            onTransfer={openTransferForReplenishment}
          />
        ) : null}

        {tab === "aging" ? <AgingBoard /> : null}

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

        {tab === "partners" ? (
          <PartnerStockBoard
            products={products}
            movements={movements}
            locations={locations}
            onRecallTransfer={openTransferFromPartner}
          />
        ) : null}

        {tab === "transfers" ? (
          <section className="space-y-3">
            <div>
              <h2 className="font-display text-xl text-deep-navy">Transfers</h2>
              <p className="text-sm text-charcoal/60 mt-0.5">
                Ledger transfer history. Start a new move from Stock, Partner Stock, or Replenishment.
              </p>
            </div>
            <DataTable
              rows={transferMovements}
              rowKey={(r) => r.id}
              emptyMessage="No transfers posted yet."
              columns={[
                { key: "date", header: "Date", render: (r) => r.date },
                {
                  key: "product",
                  header: "Product",
                  render: (r) => (
                    <Link
                      href={`/inventory/products/${r.productId}`}
                      className="hover:text-aarla-red"
                    >
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
                { key: "qty", header: "Qty", render: (r) => String(r.quantity) },
                { key: "from", header: "From", render: (r) => locationName(r.fromLocationId) },
                { key: "to", header: "To", render: (r) => locationName(r.toLocationId) },
                { key: "ref", header: "Reference", render: (r) => r.reference },
              ]}
            />
          </section>
        ) : null}

        {tab === "reconcile" ? <ReconcileBoard /> : null}

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

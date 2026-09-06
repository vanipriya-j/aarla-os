"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { DiagnosticsPagination } from "@/components/customer-calls/DiagnosticsPagination";
import { inputClass, selectClass } from "@/components/ui/FormSection";
import {
  STOCK_TABLE_PAGE_SIZE,
  buildStockCatalogEntries,
  buildStockTableRows,
  filterStockTableRows,
  paginateStockTableRows,
  rowsForStockCatalogView,
  sortStockCatalogEntries,
  uniqueStockCategories,
  type StockCatalogEntry,
  type StockSortKey,
  type StockStockFilter,
  type StockTableRow,
} from "@/lib/domain/inventory-stock-table";
import type { Location, Product, ReorderRule, StockMovement } from "@/lib/domain/types";
import {
  manufactureReorderHref,
  suggestedReorderQty,
} from "@/lib/domain/manufacture-reorder-link";
import { Search, RefreshCw } from "lucide-react";
import { ShopifyIcon } from "@/components/icons/ShopifyIcon";
import { Button } from "@/components/ui/Button";
import { StockMatrix } from "@/components/inventory/StockMatrix";
import { ApparelReorderModal } from "@/components/inventory/ApparelReorderModal";
import { newCommerceSyncLockToken } from "@/lib/client/commerce-sync-auto-retry";
import {
  pullShopifyAvailableRowViaApi,
  unlockCommerceSyncLockViaApi,
} from "@/lib/client/commerce-sync-api";

export type StockCatalogSelection = {
  product: Product;
  cell: StockTableRow["cell"];
  variantLabel: string;
};

type Props = {
  products: Product[];
  movements: StockMovement[];
  locations: Location[];
  reorderRules: ReorderRule[];
  onSelectVariant: (selection: StockCatalogSelection) => void;
  /** Called after a per-row Shopify pull so the parent can show a toast and soft-refresh. */
  onShopifyRowSynced?: (message?: string) => void;
};

const STOCK_FILTERS: { id: StockStockFilter; label: string }[] = [
  { id: "all", label: "All stock" },
  { id: "in-stock", label: "In stock" },
  { id: "zero", label: "Zero" },
  { id: "low", label: "Low stock" },
];

const SORT_OPTIONS: { id: StockSortKey; label: string }[] = [
  { id: "title-asc", label: "Product A–Z" },
  { id: "title-desc", label: "Product Z–A" },
  { id: "category-asc", label: "Type A–Z" },
  { id: "total-desc", label: "Total high → low" },
  { id: "total-asc", label: "Total low → high" },
  { id: "studio-desc", label: "Studio high → low" },
  { id: "sku-asc", label: "SKU A–Z" },
];

function pillClass(active: boolean): string {
  return `text-sm rounded-full px-3 py-1.5 border transition ${
    active
      ? "bg-aarla-red text-white border-aarla-red"
      : "border-border bg-white text-charcoal/70 hover:border-aarla-red/40"
  }`;
}

export function StockCatalogPanel({
  products,
  movements,
  locations,
  reorderRules,
  onSelectVariant,
  onShopifyRowSynced,
}: Props) {
  const [category, setCategory] = useState<string | "all">("all");
  const [stockFilter, setStockFilter] = useState<StockStockFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<StockSortKey>("title-asc");
  const [page, setPage] = useState(1);
  const [rowSyncing, setRowSyncing] = useState<string | null>(null);
  const [rowSyncMsg, setRowSyncMsg] = useState<string | null>(null);
  const [apparelReorder, setApparelReorder] = useState<StockCatalogEntry & { kind: "apparel" } | null>(
    null,
  );

  const allRows = useMemo(
    () => buildStockTableRows({ products, movements, locations, reorderRules }),
    [products, movements, locations, reorderRules],
  );

  const allEntries = useMemo(() => buildStockCatalogEntries(allRows), [allRows]);

  const categories = useMemo(() => uniqueStockCategories(allRows), [allRows]);

  const filtered = useMemo(
    () =>
      filterStockTableRows(allRows, {
        category,
        query,
        stock: stockFilter,
      }),
    [allRows, category, query, stockFilter],
  );

  const catalogRows = useMemo(
    () => rowsForStockCatalogView(allRows, filtered),
    [allRows, filtered],
  );

  const entries = useMemo(() => {
    const grouped = buildStockCatalogEntries(catalogRows);
    return sortStockCatalogEntries(grouped, sort);
  }, [catalogRows, sort]);

  const paged = useMemo(
    () => paginateStockTableRows(entries, page, STOCK_TABLE_PAGE_SIZE),
    [entries, page],
  );

  const flatRowsOnPage = useMemo(
    () =>
      paged.pageRows.flatMap((e) => (e.kind === "variant" ? [e.row] : [])),
    [paged.pageRows],
  );

  const apparelOnPage = useMemo(
    () => paged.pageRows.filter((e): e is StockCatalogEntry & { kind: "apparel" } => e.kind === "apparel"),
    [paged.pageRows],
  );

  useEffect(() => {
    if (page !== paged.page) setPage(paged.page);
  }, [page, paged.page]);

  const resetPage = () => setPage(1);

  const syncShopifyRow = async (r: StockTableRow) => {
    if (!r.shopifyVariantId && !r.variantSku && !r.product.shopifyProductId) return;
    setRowSyncing(r.key);
    setRowSyncMsg(
      `Pulling Shopify Available → Studio for ${r.variantSku || r.productTitle}…`,
    );
    const token = newCommerceSyncLockToken();
    try {
      const res = await pullShopifyAvailableRowViaApi(token, {
        shopifyVariantId: r.shopifyVariantId,
        sku: r.variantSku || r.productSku,
        productId: r.productId,
        variantId: r.variantId,
        shopifyProductId: r.product.shopifyProductId,
      });
      if (!res.ok) {
        setRowSyncMsg(res.error);
        return;
      }
      const bits: string[] = [];
      if (res.data.pulled && res.data.row) {
        bits.push(
          `Studio set to ${res.data.row.shopifyAvailable} from ${res.data.locationName ?? "Shopify"}`,
        );
        if (
          res.data.shopTotal != null &&
          res.data.shopTotal !== res.data.row.shopifyAvailable
        ) {
          bits.push(`shop total ${res.data.shopTotal}`);
        }
      } else if (res.data.aligned && res.data.row) {
        bits.push(
          `Studio ↔ ${res.data.locationName ?? "Shopify"} aligned at ${res.data.row.shopifyAvailable}`,
        );
        if (
          res.data.shopTotal != null &&
          res.data.shopTotal !== res.data.row.shopifyAvailable
        ) {
          bits.push(`shop total ${res.data.shopTotal}`);
        }
      } else if (res.data.row) {
        bits.push(
          `Studio ${res.data.row.aarlaStudio} / Shopify ${res.data.row.shopifyAvailable}`,
        );
      }
      if (res.data.levelSummary) bits.push(res.data.levelSummary);
      if (res.data.errors.length) bits.push(res.data.errors[0]!);
      if (!res.data.pulled && !res.data.aligned && res.data.errors.length) {
        const failMsg = [res.data.errors[0], res.data.levelSummary]
          .filter(Boolean)
          .join(" · ");
        setRowSyncMsg(failMsg);
        onShopifyRowSynced?.(failMsg);
        return;
      }
      const msg = bits.join(" · ") || "Synced";
      setRowSyncMsg(msg);
      onShopifyRowSynced?.(msg);
    } catch (err) {
      const failMsg = err instanceof Error ? err.message : String(err);
      setRowSyncMsg(failMsg);
      onShopifyRowSynced?.(failMsg);
    } finally {
      setRowSyncing(null);
      await unlockCommerceSyncLockViaApi().catch(() => undefined);
    }
  };

  const selectFromCell = (product: Product, cell: StockTableRow["cell"], label: string) => {
    onSelectVariant({ product, cell, variantLabel: label });
  };

  return (
    <div className="space-y-4" data-testid="stock-catalog-panel">
      {rowSyncMsg ? (
        <p className="text-sm text-deep-navy rounded-lg border border-border bg-white px-3 py-2">
          {rowSyncMsg}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Product type">
        <button
          type="button"
          role="tab"
          aria-selected={category === "all"}
          className={pillClass(category === "all")}
          onClick={() => {
            setCategory("all");
            resetPage();
          }}
        >
          All types
          <span className="ml-1.5 tabular-nums opacity-80">{allEntries.length}</span>
        </button>
        {categories.map((cat) => {
          const count = allEntries.filter((e) =>
            e.kind === "apparel"
              ? (e.product.category || "Uncategorised") === cat
              : e.row.category === cat,
          ).length;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={category === cat}
              className={pillClass(category === cat)}
              onClick={() => {
                setCategory(cat);
                resetPage();
              }}
            >
              {cat}
              <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/40"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPage();
            }}
            placeholder="Search product, variant, or SKU…"
            className={`${inputClass} pl-9`}
            data-testid="stock-catalog-search"
            aria-label="Search stock"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-charcoal/55" htmlFor="stock-catalog-sort">
            Sort
          </label>
          <select
            id="stock-catalog-sort"
            className={`${selectClass} w-auto min-w-[11rem]`}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as StockSortKey);
              resetPage();
            }}
            data-testid="stock-catalog-sort"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="Stock filter">
        {STOCK_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={pillClass(stockFilter === f.id)}
            onClick={() => {
              setStockFilter(f.id);
              resetPage();
            }}
          >
            {f.label}
          </button>
        ))}
        {stockFilter === "zero" || stockFilter === "low" ? (
          <Link
            href={manufactureReorderHref({
              productId: "",
              filter: stockFilter === "zero" ? "zero" : "low",
            })}
            className="text-sm text-aarla-red hover:underline underline-offset-2 ml-1"
            data-testid="stock-filter-reorder-link"
          >
            Reorder {stockFilter === "zero" ? "zero-stock" : "low-stock"} →
          </Link>
        ) : null}
      </div>

      {apparelOnPage.length ? (
        <div className="space-y-4" data-testid="stock-apparel-blocks">
          {apparelOnPage.map((block) => (
            <div
              key={block.key}
              className="rounded-2xl border border-border bg-white overflow-hidden"
              data-testid={`stock-apparel-${block.product.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border bg-pale-cream/60">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/products/${block.product.id}`}
                      className="font-medium text-deep-navy hover:text-aarla-red"
                    >
                      {block.product.title}
                    </Link>
                    {block.shopifyAdminUrl ? (
                      <a
                        href={block.shopifyAdminUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Edit in Shopify Admin"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#96bf48] hover:bg-[#96bf48]/15"
                      >
                        <ShopifyIcon className="h-4 w-4" />
                      </a>
                    ) : null}
                    {block.lowStock ? <StatusChip label="Low stock" tone="warning" /> : null}
                  </div>
                  <p className="text-xs text-charcoal/50 mt-0.5">
                    {block.product.category || "T-Shirt"} · {block.product.sku} · Colour × Size
                  </p>
                  <p className="text-xs text-charcoal/55 mt-1 tabular-nums">
                    Studio {block.studio} · Partner {block.partner} · Channel {block.channel} ·
                    Total {block.total}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={block.total <= 0 || block.lowStock ? "primary" : "outline"}
                  onClick={() => setApparelReorder(block)}
                  data-testid="stock-apparel-reorder"
                >
                  Reorder sizes
                </Button>
              </div>
              <div className="p-2 md:p-3">
                <StockMatrix
                  rows={block.matrix}
                  rowHeader="Colour"
                  columnHeader="Size"
                  lowStockVariantIds={new Set(block.lowStockVariantIds)}
                  onCellClick={(cell) => {
                    const variant = block.product.variants.find((v) => v.id === cell.variantId);
                    selectFromCell(
                      block.product,
                      cell,
                      variant?.label ?? cell.variantId,
                    );
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {flatRowsOnPage.length ? (
        <DataTable
          rows={flatRowsOnPage}
          rowKey={(r) => r.key}
          emptyMessage={
            query || category !== "all" || stockFilter !== "all"
              ? "No variants match these filters."
              : "No products in the catalog yet."
          }
          onRowClick={(r) =>
            onSelectVariant({
              product: r.product,
              cell: r.cell,
              variantLabel: r.variantLabel,
            })
          }
          columns={[
            {
              key: "product",
              header: "Product",
              render: (r) => (
                <div className="min-w-[10rem]">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${r.productId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-deep-navy hover:text-aarla-red"
                      >
                        {r.productTitle}
                      </Link>
                      <p className="text-xs text-charcoal/50">{r.productSku}</p>
                    </div>
                    {r.shopifyAdminUrl ? (
                      <a
                        href={r.shopifyAdminUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Edit in Shopify Admin"
                        aria-label={`Edit ${r.productTitle} in Shopify Admin`}
                        data-testid="stock-shopify-admin-link"
                        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#96bf48] hover:bg-[#96bf48]/15 hover:text-[#5e8e3e]"
                      >
                        <ShopifyIcon className="h-4 w-4" />
                      </a>
                    ) : null}
                    {r.shopifyVariantId || r.product.shopifyProductId || r.variantSku ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void syncShopifyRow(r);
                        }}
                        disabled={!!rowSyncing}
                        title="Pull Shopify Available into Studio for this SKU"
                        aria-label={`Pull Shopify stock for ${r.productTitle} into Studio`}
                        data-testid="stock-row-sync"
                        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-deep-navy hover:bg-pale-cream disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${rowSyncing === r.key ? "animate-spin" : ""}`}
                        />
                      </button>
                    ) : null}
                  </div>
                </div>
              ),
            },
            {
              key: "type",
              header: "Type",
              render: (r) => <span className="text-charcoal/70">{r.category}</span>,
            },
            {
              key: "variant",
              header: "Variant",
              render: (r) => <span className="font-medium text-deep-navy">{r.variantLabel}</span>,
            },
            {
              key: "sku",
              header: "SKU",
              render: (r) => r.variantSku || "—",
            },
            {
              key: "studio",
              header: "Studio",
              render: (r) => <span className="tabular-nums">{r.studio}</span>,
            },
            {
              key: "partner",
              header: "Partner",
              render: (r) => <span className="tabular-nums">{r.partner}</span>,
            },
            {
              key: "channel",
              header: "Channel",
              render: (r) => <span className="tabular-nums">{r.channel}</span>,
            },
            {
              key: "damaged",
              header: "Damaged",
              render: (r) => <span className="tabular-nums">{r.damaged}</span>,
            },
            {
              key: "total",
              header: "Total",
              render: (r) => (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums text-deep-navy">{r.total}</span>
                  {r.lowStock && r.total > 0 ? (
                    <StatusChip label="Low stock" tone="warning" />
                  ) : null}
                </div>
              ),
            },
            {
              key: "make",
              header: "Reorder",
              render: (r) => {
                const suggested = suggestedReorderQty(r.total);
                const label =
                  r.variantLabel && r.variantLabel !== "Default"
                    ? `${r.productTitle} / ${r.variantLabel}`
                    : r.productTitle;
                return (
                  <Link
                    href={manufactureReorderHref({
                      productId: r.productId,
                      variantId: r.variantId,
                      quantity: suggested,
                      label,
                    })}
                    onClick={(e) => e.stopPropagation()}
                    data-testid="stock-row-reorder"
                  >
                    <Button size="sm" variant={r.total <= 0 || r.lowStock ? "primary" : "outline"}>
                      Reorder
                    </Button>
                  </Link>
                );
              },
            },
          ]}
        />
      ) : null}

      {!apparelOnPage.length && !flatRowsOnPage.length ? (
        <p className="text-sm text-charcoal/55 rounded-xl border border-dashed border-border px-4 py-8 text-center">
          {query || category !== "all" || stockFilter !== "all"
            ? "No products match these filters."
            : "No products in the catalog yet."}
        </p>
      ) : null}

      <DiagnosticsPagination
        page={paged.page}
        totalPages={paged.totalPages}
        total={paged.total}
        pageSize={STOCK_TABLE_PAGE_SIZE}
        onPageChange={setPage}
        testId="stock-catalog-pagination"
      />

      <p className="text-xs text-charcoal/50">
        T-shirts show as Colour × Size matrices (one block per design). Other products stay one row
        per variant. Click a size cell for location breakdown.{" "}
        <strong>Reorder sizes</strong> opens a colour/size qty popup, then Needs Making.
      </p>

      {apparelReorder ? (
        <ApparelReorderModal
          open
          onClose={() => setApparelReorder(null)}
          product={apparelReorder.product}
          cells={apparelReorder.variantRows.map((r) => r.cell)}
        />
      ) : null}
    </div>
  );
}

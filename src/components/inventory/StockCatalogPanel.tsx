"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { DiagnosticsPagination } from "@/components/customer-calls/DiagnosticsPagination";
import { inputClass, selectClass } from "@/components/ui/FormSection";
import {
  STOCK_TABLE_PAGE_SIZE,
  buildStockTableRows,
  filterStockTableRows,
  paginateStockTableRows,
  sortStockTableRows,
  uniqueStockCategories,
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

  const allRows = useMemo(
    () => buildStockTableRows({ products, movements, locations, reorderRules }),
    [products, movements, locations, reorderRules],
  );

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

  const sorted = useMemo(() => sortStockTableRows(filtered, sort), [filtered, sort]);

  const paged = useMemo(
    () => paginateStockTableRows(sorted, page, STOCK_TABLE_PAGE_SIZE),
    [sorted, page],
  );

  // Keep page in range when filters shrink the result set.
  useEffect(() => {
    if (page !== paged.page) setPage(paged.page);
  }, [page, paged.page]);

  const resetPage = () => setPage(1);

  const syncShopifyRow = async (r: StockTableRow) => {
    if (!r.shopifyVariantId && !r.variantSku && !r.product.shopifyProductId) return;
    setRowSyncing(r.key);
    setRowSyncMsg(
      `Pulling Aarla Office Available → Studio for ${r.variantSku || r.productTitle}…`,
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
          `Studio set to ${res.data.row.shopifyAvailable} from ${res.data.locationName ?? "Aarla Office"}`,
        );
        if (
          res.data.shopTotal != null &&
          res.data.shopTotal !== res.data.row.shopifyAvailable
        ) {
          bits.push(`shop total ${res.data.shopTotal} ignored`);
        }
      } else if (res.data.aligned && res.data.row) {
        bits.push(
          `Studio ↔ ${res.data.locationName ?? "Aarla Office"} aligned at ${res.data.row.shopifyAvailable}`,
        );
        if (
          res.data.shopTotal != null &&
          res.data.shopTotal !== res.data.row.shopifyAvailable
        ) {
          bits.push(`shop total ${res.data.shopTotal}`);
        }
      } else if (res.data.row) {
        bits.push(
          `Studio ${res.data.row.aarlaStudio} / Office ${res.data.row.shopifyAvailable}`,
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
          <span className="ml-1.5 tabular-nums opacity-80">{allRows.length}</span>
        </button>
        {categories.map((cat) => {
          const count = allRows.filter((r) => r.category === cat).length;
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

      <DataTable
        rows={paged.pageRows}
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

      <DiagnosticsPagination
        page={paged.page}
        totalPages={paged.totalPages}
        total={paged.total}
        pageSize={STOCK_TABLE_PAGE_SIZE}
        onPageChange={setPage}
        testId="stock-catalog-pagination"
      />

      <p className="text-xs text-charcoal/50">
        One row per variant. Click a row for location breakdown, transfer, or adjust.{" "}
        <strong>Reorder</strong> opens Needs Making to add the SKU to a vendor PO (multi-product
        orders supported). Filter Zero / Low stock for restock candidates.
      </p>
    </div>
  );
}

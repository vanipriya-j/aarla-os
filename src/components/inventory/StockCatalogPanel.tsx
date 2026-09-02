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
import { Search, RefreshCw } from "lucide-react";
import { ShopifyIcon } from "@/components/icons/ShopifyIcon";
import {
  newCommerceSyncLockToken,
} from "@/lib/client/commerce-sync-auto-retry";
import {
  refreshShopifyInventoryRowViaApi,
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
  /** Called after a per-row Shopify refresh so the parent can reload ledger/catalog. */
  onShopifyRowSynced?: () => void;
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
    setRowSyncMsg(`Syncing ${r.variantSku || r.productTitle} from Shopify…`);
    const token = newCommerceSyncLockToken();
    try {
      const res = await refreshShopifyInventoryRowViaApi(token, {
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
      if (res.data.catalogUpdated) bits.push("catalog updated");
      if (res.data.row) {
        bits.push(
          res.data.aligned
            ? "Studio ↔ Shopify aligned"
            : `Studio ${res.data.row.aarlaStudio} / Shopify ${res.data.row.shopifyAvailable}`,
        );
      }
      if (res.data.errors.length) bits.push(res.data.errors[0]!);
      setRowSyncMsg(bits.join(" · ") || "Synced");
      onShopifyRowSynced?.();
    } catch (err) {
      setRowSyncMsg(err instanceof Error ? err.message : String(err));
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

      <div className="flex flex-wrap gap-2" aria-label="Stock filter">
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
                      title="Sync this SKU from Shopify (after fixing Admin)"
                      aria-label={`Sync ${r.productTitle} from Shopify`}
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
              <div className="flex items-center gap-2">
                <span className="font-medium tabular-nums text-deep-navy">{r.total}</span>
                {r.lowStock ? <StatusChip label="Low stock" tone="danger" /> : null}
              </div>
            ),
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
        One row per variant. Click a row for location breakdown, transfer, or adjust. Open the
        product name for the Aarla product page, or the Shopify icon to edit in Admin.
      </p>
    </div>
  );
}

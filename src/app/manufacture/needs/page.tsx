"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import {
  createVendorOrderAction,
  getNeedsMakingAction,
  listManufactureVendorsAction,
  listProductsForManufactureAction,
} from "@/app/actions/manufacture-actions";

type NeedItem = {
  productId: string;
  variantId: string | null;
  label: string;
  sku?: string;
  quantityToProduce: number;
  reason: string;
  available: number;
  kind: string;
};

function NeedsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const makeProductId = search.get("make");
  const makeVariantId = search.get("variant");
  const makeQty = Number(search.get("qty") ?? "20");
  const makeLabelParam = search.get("label");
  const makeFilter = search.get("filter");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<{
    persisted: Array<{
      code: string;
      productId: string;
      variantId: string | null;
      quantityToProduce: number;
      reason: string;
      sourceType: string;
    }>;
    fromInventory: NeedItem[];
    zeroCount: number;
    lowCount: number;
  } | null>(null);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<
    Array<{
      id: string;
      title: string;
      sku: string;
      variants: Array<{ id: string; label: string; sku: string }>;
    }>
  >([]);
  const [vendorCode, setVendorCode] = useState("");
  const [qty, setQty] = useState(Number.isFinite(makeQty) ? makeQty : 20);
  const [query, setQuery] = useState("");
  const [pickProductId, setPickProductId] = useState("");
  const [pickVariantId, setPickVariantId] = useState("");
  const [filter, setFilter] = useState<"all" | "zero" | "low">(
    makeFilter === "zero" || makeFilter === "low" ? makeFilter : "all",
  );

  const load = () => {
    startTransition(async () => {
      setError(null);
      const [n, v, p] = await Promise.all([
        getNeedsMakingAction(),
        listManufactureVendorsAction(),
        listProductsForManufactureAction(),
      ]);
      if (!n.ok) setError(n.error);
      else setBoard(n.data);
      if (v.ok) {
        setVendors(v.data.map((x) => ({ id: x.id, name: x.name })));
        setVendorCode((prev) => prev || v.data[0]?.id || "");
      }
      if (p.ok) setProducts(p.data);
    });
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (Number.isFinite(makeQty) && makeQty > 0) setQty(makeQty);
  }, [makeQty]);

  const makeLabel = useMemo(() => {
    if (makeLabelParam) return makeLabelParam;
    if (!makeProductId) return null;
    const fromBoard = board?.fromInventory.find(
      (n) =>
        n.productId === makeProductId &&
        (makeVariantId ? n.variantId === makeVariantId : true),
    );
    if (fromBoard) return fromBoard.label;
    const product = products.find((p) => p.id === makeProductId);
    if (!product) return makeProductId;
    const variant = product.variants.find((v) => v.id === makeVariantId);
    return variant ? `${product.title} / ${variant.label}` : product.title;
  }, [board, makeLabelParam, makeProductId, makeVariantId, products]);

  const filteredNeeds = useMemo(() => {
    const items = board?.fromInventory ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (filter === "zero" && n.kind !== "zero") return false;
      if (filter === "low" && n.kind !== "aarla-low" && n.kind !== "global-low") return false;
      if (!q) return true;
      return (
        n.label.toLowerCase().includes(q) ||
        n.productId.toLowerCase().includes(q) ||
        (n.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [board, filter, query]);

  const pickProduct = products.find((p) => p.id === pickProductId);

  function createOrder(opts: {
    productId: string;
    variantId?: string | null;
    title: string;
    sku?: string;
    quantity: number;
  }) {
    if (!vendorCode) {
      setError("Pick a vendor first — add one under Vendors if the list is empty.");
      return;
    }
    startTransition(async () => {
      const result = await createVendorOrderAction({
        vendorCode,
        items: [
          {
            productCode: opts.productId,
            variantCode: opts.variantId ?? null,
            title: opts.title,
            variantLabel: "",
            quantity: opts.quantity,
            sku: opts.sku ?? opts.productId,
          },
        ],
        notes: `From Needs Making · ${opts.title}`,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/manufacture/orders/${encodeURIComponent(result.data.orderNumber)}`);
    });
  }

  function createFromQuery() {
    if (!makeProductId) return;
    createOrder({
      productId: makeProductId,
      variantId: makeVariantId,
      title: makeLabel ?? makeProductId,
      quantity: qty,
    });
  }

  function createFromPicker() {
    if (!pickProduct) {
      setError("Choose a product to make.");
      return;
    }
    const variant = pickProduct.variants.find((v) => v.id === pickVariantId);
    createOrder({
      productId: pickProduct.id,
      variantId: variant?.id ?? null,
      title: variant ? `${pickProduct.title} / ${variant.label}` : pickProduct.title,
      sku: variant?.sku || pickProduct.sku,
      quantity: qty,
    });
  }

  return (
    <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-8 max-w-6xl">
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      {pending && !board ? <p className="text-sm text-charcoal/50">Loading…</p> : null}

      {makeProductId ? (
        <div className="card-surface p-4 border-aarla-red/25 space-y-3">
          <p className="font-medium text-deep-navy">Create vendor order · {makeLabel}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-charcoal/60">
              Quantity
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="mt-1 block w-24 rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-charcoal/60">
              Vendor
              <select
                value={vendorCode}
                onChange={(e) => setVendorCode(e.target.value)}
                className="mt-1 block min-w-[14rem] rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
              >
                {vendors.length === 0 ? <option value="">No vendors yet</option> : null}
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={createFromQuery} disabled={pending || !vendorCode}>
              {pending ? "Creating…" : "Create order"}
            </Button>
            <Link href="/manufacture/needs">
              <Button variant="ghost">Cancel</Button>
            </Link>
          </div>
        </div>
      ) : null}

      <section className="card-surface p-4 space-y-3">
        <h2 className="font-display text-lg text-deep-navy">Make any product</h2>
        <p className="text-sm text-charcoal/60">
          Not only low-stock alerts — pick anything from the catalog to reorder.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-charcoal/60">
            Product
            <select
              value={pickProductId}
              onChange={(e) => {
                setPickProductId(e.target.value);
                setPickVariantId("");
              }}
              className="mt-1 block min-w-[16rem] max-w-full rounded-lg border border-border px-2 py-1.5 text-sm"
            >
              <option value="">Select…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-charcoal/60">
            Variant
            <select
              value={pickVariantId}
              onChange={(e) => setPickVariantId(e.target.value)}
              className="mt-1 block min-w-[10rem] rounded-lg border border-border px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              {(pickProduct?.variants ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-charcoal/60">
            Qty
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="mt-1 block w-20 rounded-lg border border-border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-charcoal/60">
            Vendor
            <select
              value={vendorCode}
              onChange={(e) => setVendorCode(e.target.value)}
              className="mt-1 block min-w-[12rem] rounded-lg border border-border px-2 py-1.5 text-sm"
            >
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={createFromPicker} disabled={pending || !pickProductId || !vendorCode}>
            Create order
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-deep-navy">Needs Making</h2>
            <p className="text-sm text-charcoal/60 mt-1">
              Zero stock: {board?.zeroCount ?? "—"} · Below minimum: {board?.lowCount ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {(
              [
                ["all", "All"],
                ["zero", "Zero stock"],
                ["low", "Low stock"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`text-sm rounded-full px-3 py-1.5 border ${
                  filter === id
                    ? "bg-aarla-red text-white border-aarla-red"
                    : "border-border bg-white text-charcoal/70"
                }`}
              >
                {label}
              </button>
            ))}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search needs…"
              className="rounded-lg border border-border px-3 py-1.5 text-sm min-w-[10rem]"
            />
          </div>
        </div>

        {filteredNeeds.length === 0 ? (
          <p className="text-sm text-charcoal/55">
            Nothing in this filter. Use <strong>Make any product</strong> above, or check Inventory
            Zero / All stock.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredNeeds.slice(0, 80).map((n) => (
              <article
                key={`${n.productId}-${n.variantId}`}
                className="card-surface p-4 flex flex-wrap justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-deep-navy">{n.label}</p>
                  <p className="text-sm text-charcoal/65 mt-1">
                    Required: {n.quantityToProduce} · ATP: {n.available} · {n.reason}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-charcoal/40 mt-1">
                    {n.kind === "zero" ? "Zero stock" : "Low stock"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/manufacture/needs?make=${encodeURIComponent(n.productId)}${
                      n.variantId ? `&variant=${encodeURIComponent(n.variantId)}` : ""
                    }&qty=${n.quantityToProduce}&label=${encodeURIComponent(n.label)}`}
                  >
                    <Button size="sm">Reorder</Button>
                  </Link>
                  <Link href="/inventory?tab=replenishment">
                    <Button size="sm" variant="outline">
                      Transfer instead
                    </Button>
                  </Link>
                </div>
              </article>
            ))}
            {filteredNeeds.length > 80 ? (
              <p className="text-xs text-charcoal/50">
                Showing first 80 — use search to narrow.
              </p>
            ) : null}
          </div>
        )}

        {(board?.persisted.length ?? 0) > 0 ? (
          <div className="space-y-2 pt-4">
            <h3 className="text-sm font-semibold text-charcoal/70">Saved requirements</h3>
            {board!.persisted.map((n) => (
              <article key={n.code} className="card-surface p-4 flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-medium text-deep-navy">
                    {n.productId}
                    {n.variantId ? ` / ${n.variantId}` : ""}
                  </p>
                  <p className="text-sm text-charcoal/65">
                    Required: {n.quantityToProduce} · {n.reason}
                  </p>
                </div>
                <Link
                  href={`/manufacture/needs?make=${encodeURIComponent(n.productId)}&qty=${n.quantityToProduce}`}
                >
                  <Button size="sm">Reorder</Button>
                </Link>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function ManufactureNeedsPage() {
  return (
    <>
      <Header
        title="Needs Making"
        subtitle="Zero stock and low stock from Inventory — Reorder opens a vendor PO (add more lines for multi-product orders)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/manufacture/orders">
              <Button size="sm" variant="outline">
                Vendor orders
              </Button>
            </Link>
            <Link href="/inventory">
              <Button size="sm" variant="outline">
                Inventory
              </Button>
            </Link>
            <Link href="/manufacture">
              <Button size="sm" variant="outline">
                Manufacture home
              </Button>
            </Link>
          </div>
        }
      />
      <Suspense fallback={<p className="px-8 py-6 text-sm text-charcoal/50">Loading…</p>}>
        <NeedsInner />
      </Suspense>
    </>
  );
}

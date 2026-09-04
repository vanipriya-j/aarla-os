"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import {
  createVendorOrderAction,
  listManufactureVendorsAction,
  listProductsForManufactureAction,
  listVendorOrdersAction,
} from "@/app/actions/manufacture-actions";
import type { VendorOrder } from "@/lib/domain/manufacture-types";

export default function ManufactureOrdersPage() {
  const [pending, startTransition] = useTransition();
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<
    Array<{ id: string; title: string; sku: string; variants: Array<{ id: string; label: string; sku: string }> }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [vendorCode, setVendorCode] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(20);
  const [lines, setLines] = useState<
    Array<{ productCode: string; variantCode?: string | null; title: string; variantLabel?: string; sku?: string; quantity: number }>
  >([]);

  const load = () => {
    startTransition(async () => {
      setError(null);
      const [o, v, p] = await Promise.all([
        listVendorOrdersAction(),
        listManufactureVendorsAction(),
        listProductsForManufactureAction(),
      ]);
      if (!o.ok) setError(o.error);
      else setOrders(o.data);
      if (v.ok) {
        setVendors(v.data.map((x) => ({ id: x.id, name: x.name })));
        setVendorCode((c) => c || v.data[0]?.id || "");
      }
      if (p.ok) {
        setProducts(p.data);
        setProductId((c) => c || p.data[0]?.id || "");
      }
    });
  };

  useEffect(() => {
    load();
  }, []);

  const selectedProduct = products.find((p) => p.id === productId);

  function addLine() {
    if (!selectedProduct) return;
    const variant = selectedProduct.variants.find((v) => v.id === variantId);
    setLines((prev) => [
      ...prev,
      {
        productCode: selectedProduct.id,
        variantCode: variant?.id ?? null,
        title: selectedProduct.title,
        variantLabel: variant?.label ?? "",
        sku: variant?.sku || selectedProduct.sku,
        quantity: qty,
      },
    ]);
  }

  function create() {
    if (!vendorCode || lines.length === 0) {
      setError("Add at least one line and pick a vendor.");
      return;
    }
    startTransition(async () => {
      const result = await createVendorOrderAction({ vendorCode, items: lines });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.href = `/manufacture/orders/${encodeURIComponent(result.data.orderNumber)}`;
    });
  }

  return (
    <>
      <Header
        title="Vendor Orders"
        subtitle="Structured manufacturing orders — source of truth before WhatsApp or PDF."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/manufacture">
              <Button size="sm" variant="outline">
                Home
              </Button>
            </Link>
            <Button size="sm" onClick={() => setShowCreate((s) => !s)}>
              New order
            </Button>
          </div>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}

        {showCreate ? (
          <section className="card-surface p-4 space-y-4">
            <h2 className="font-display text-lg text-deep-navy">Create vendor order</h2>
            <label className="block text-xs text-charcoal/60">
              Vendor
              <select
                className="mt-1 block w-full max-w-md rounded-lg border border-border px-2 py-1.5 text-sm"
                value={vendorCode}
                onChange={(e) => setVendorCode(e.target.value)}
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-charcoal/60">
                Product
                <select
                  className="mt-1 block min-w-[12rem] rounded-lg border border-border px-2 py-1.5 text-sm"
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    setVariantId("");
                  }}
                >
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
                  className="mt-1 block min-w-[10rem] rounded-lg border border-border px-2 py-1.5 text-sm"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                >
                  <option value="">—</option>
                  {(selectedProduct?.variants ?? []).map((v) => (
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
              <Button size="sm" variant="outline" onClick={addLine}>
                Add line
              </Button>
            </div>
            {lines.length > 0 ? (
              <ul className="text-sm space-y-1">
                {lines.map((l, i) => (
                  <li key={`${l.productCode}-${i}`}>
                    {l.title}
                    {l.variantLabel ? ` / ${l.variantLabel}` : ""} · {l.quantity}
                    <button
                      type="button"
                      className="ml-2 text-aarla-red text-xs"
                      onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button onClick={create} disabled={pending}>
              {pending ? "Creating…" : "Create order"}
            </Button>
          </section>
        ) : null}

        <section className="space-y-3">
          {pending && !orders.length ? (
            <p className="text-sm text-charcoal/50">Loading…</p>
          ) : null}
          {orders.map((o) => (
            <Link
              key={o.orderNumber}
              href={`/manufacture/orders/${encodeURIComponent(o.orderNumber)}`}
              className="card-surface p-4 block hover:border-aarla-red/30"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-medium text-deep-navy">{o.orderNumber}</p>
                <span className="text-xs uppercase tracking-wide text-charcoal/50">
                  {o.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="text-sm text-charcoal/65 mt-1">
                Vendor {o.vendorId} · {o.items.length} line{o.items.length === 1 ? "" : "s"} ·{" "}
                {o.pricingStatus === "pending" ? "PRICE PENDING" : o.total != null ? `₹${o.total}` : "—"}
              </p>
              <p className="text-xs text-charcoal/50 mt-1">
                Vendor committed {o.vendorCommittedDate ?? "—"} · Aarla expected{" "}
                {o.internalExpectedDate ?? "—"}
              </p>
            </Link>
          ))}
          {!pending && !orders.length ? (
            <p className="text-sm text-charcoal/55">No vendor orders yet. Create one from Needs Making or above.</p>
          ) : null}
        </section>
      </main>
    </>
  );
}

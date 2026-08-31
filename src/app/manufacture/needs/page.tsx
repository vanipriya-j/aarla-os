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
} from "@/app/actions/manufacture-actions";

function NeedsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const makeProductId = search.get("make");
  const makeQty = Number(search.get("qty") ?? "20");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<Awaited<
    Extract<Awaited<ReturnType<typeof getNeedsMakingAction>>, { ok: true }>
  >["data"] | null>(null);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [vendorCode, setVendorCode] = useState("");
  const [qty, setQty] = useState(Number.isFinite(makeQty) ? makeQty : 20);

  const load = () => {
    startTransition(async () => {
      setError(null);
      const [n, v] = await Promise.all([
        getNeedsMakingAction(),
        listManufactureVendorsAction(),
      ]);
      if (!n.ok) setError(n.error);
      else setBoard(n.data);
      if (v.ok) {
        setVendors(v.data.map((x) => ({ id: x.id, name: x.name })));
        setVendorCode((prev) => prev || v.data[0]?.id || "");
      }
    });
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (Number.isFinite(makeQty) && makeQty > 0) setQty(makeQty);
  }, [makeQty]);

  const makeLabel = useMemo(() => {
    if (!makeProductId || !board) return makeProductId;
    const hit = board.fromInventory.find((n) => n.productId === makeProductId);
    return hit?.label ?? makeProductId;
  }, [board, makeProductId]);

  function createOrder() {
    if (!makeProductId || !vendorCode) {
      setError("Pick a vendor first — add one under Vendors if the list is empty.");
      return;
    }
    startTransition(async () => {
      const result = await createVendorOrderAction({
        vendorCode,
        items: [
          {
            productCode: makeProductId,
            title: makeLabel ?? makeProductId,
            quantity: qty,
            sku: makeProductId,
          },
        ],
        notes: `From Needs Making · ${makeLabel}`,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/manufacture/orders/${encodeURIComponent(result.data.orderNumber)}`);
    });
  }

  const active = board?.fromInventory ?? [];
  const persisted = board?.persisted ?? [];

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
            <Button onClick={createOrder} disabled={pending || !vendorCode}>
              {pending ? "Creating…" : "Create order"}
            </Button>
            <Link href="/manufacture/needs">
              <Button variant="ghost">Cancel</Button>
            </Link>
          </div>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-display text-xl text-deep-navy">Needs Making</h2>
        <p className="text-sm text-charcoal/60">
          Inventory recommends. Manufacturing executes into the same vendor-order object.
        </p>
        {active.length === 0 && persisted.length === 0 ? (
          <p className="text-sm text-charcoal/55">
            No replenishment needs right now. Low-stock signals from Inventory will show here.
          </p>
        ) : (
          <div className="space-y-3">
            {active.map((n) => (
              <article
                key={`${n.productId}-${n.variantId}`}
                className="card-surface p-4 flex flex-wrap justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-deep-navy">{n.label}</p>
                  <p className="text-sm text-charcoal/65 mt-1">
                    Required: {n.quantityToProduce} · ATP: {n.available} · {n.reason}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/manufacture/needs?make=${encodeURIComponent(n.productId)}&qty=${n.quantityToProduce}`}
                  >
                    <Button size="sm">Make</Button>
                  </Link>
                  <Link href="/inventory/transfers">
                    <Button size="sm" variant="outline">
                      Transfer instead
                    </Button>
                  </Link>
                </div>
              </article>
            ))}
            {persisted.map((n) => (
              <article key={n.code} className="card-surface p-4 flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-medium text-deep-navy">
                    {n.productId}
                    {n.variantId ? ` / ${n.variantId}` : ""}
                  </p>
                  <p className="text-sm text-charcoal/65">
                    Required: {n.quantityToProduce} · {n.reason} · {n.sourceType}
                  </p>
                </div>
                <Link
                  href={`/manufacture/needs?make=${encodeURIComponent(n.productId)}&qty=${n.quantityToProduce}`}
                >
                  <Button size="sm">Make</Button>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function ManufactureNeedsPage() {
  return (
    <>
      <Header
        title="Needs Making"
        subtitle="Convert inventory recommendations into structured vendor orders."
        actions={
          <Link href="/manufacture">
            <Button size="sm" variant="outline">
              Manufacture home
            </Button>
          </Link>
        }
      />
      <Suspense fallback={<p className="px-8 py-6 text-sm text-charcoal/50">Loading…</p>}>
        <NeedsInner />
      </Suspense>
    </>
  );
}

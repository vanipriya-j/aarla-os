"use client";

import { useMemo } from "react";
import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { deriveVariantLocationBreakdown, DEFAULT_INVENTORY_LOC } from "@/lib/domain/ledger";
import type { Location, Product, StockMovement } from "@/lib/domain/types";

export type PartnerStockRow = {
  productId: string;
  productTitle: string;
  variantId: string;
  variantLabel: string;
  partnerId: string;
  partnerName: string;
  locationId: string;
  quantity: number;
};

interface PartnerStockBoardProps {
  products: Product[];
  movements: StockMovement[];
  locations: Location[];
  onRecallTransfer?: (row: PartnerStockRow) => void;
}

export function PartnerStockBoard({
  products,
  movements,
  locations,
  onRecallTransfer,
}: PartnerStockBoardProps) {
  const rows = useMemo(() => {
    const out: PartnerStockRow[] = [];
    const partnerLocs = locations.filter((l) => l.kind === "Partner");
    for (const product of products) {
      for (const v of product.variants) {
        const cell = deriveVariantLocationBreakdown(
          movements,
          product.id,
          v.id,
          locations,
          DEFAULT_INVENTORY_LOC,
        );
        for (const loc of cell.byLocation) {
          if (loc.kind !== "Partner" || loc.quantity <= 0) continue;
          const partnerLoc = partnerLocs.find((l) => l.id === loc.locationId);
          out.push({
            productId: product.id,
            productTitle: product.title,
            variantId: v.id,
            variantLabel: v.label,
            partnerId: partnerLoc?.partnerId ?? loc.locationId,
            partnerName: loc.locationName,
            locationId: loc.locationId,
            quantity: loc.quantity,
          });
        }
      }
    }
    return out.sort((a, b) => b.quantity - a.quantity || a.productTitle.localeCompare(b.productTitle));
  }, [products, movements, locations]);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl text-deep-navy">Partner Stock</h2>
        <p className="text-sm text-charcoal/60 mt-0.5">
          Physical stock at partner locations from the ledger. Recall is a Transfer back to Studio —
          planning-only partner recall stays on Campaigns.
        </p>
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => `${r.productId}:${r.variantId}:${r.locationId}`}
        emptyMessage="No partner locations hold stock right now."
        columns={[
          {
            key: "item",
            header: "Item",
            render: (r) => (
              <div>
                <Link
                  href={`/inventory/products/${r.productId}`}
                  className="font-medium text-deep-navy hover:text-aarla-red"
                >
                  {r.productTitle}
                </Link>
                <p className="text-xs text-charcoal/50">{r.variantLabel}</p>
              </div>
            ),
          },
          {
            key: "partner",
            header: "Partner",
            render: (r) => (
              <Link href="/partners" className="hover:text-aarla-red">
                {r.partnerName}
              </Link>
            ),
          },
          { key: "qty", header: "Qty", render: (r) => String(r.quantity) },
          {
            key: "action",
            header: "",
            render: (r) =>
              onRecallTransfer ? (
                <Button size="sm" variant="outline" onClick={() => onRecallTransfer(r)}>
                  Transfer to Studio
                </Button>
              ) : null,
          },
        ]}
      />
    </section>
  );
}

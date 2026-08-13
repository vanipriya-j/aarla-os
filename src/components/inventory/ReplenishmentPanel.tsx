"use client";

import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import type { ReplenishmentItem } from "@/lib/domain/inventory-replenishment";

interface ReplenishmentPanelProps {
  title: string;
  description?: string;
  items: ReplenishmentItem[];
  onTransfer: (item: ReplenishmentItem) => void;
  emptyMessage?: string;
}

/** One replenishment section (Aarla Low / Partner Need / Global Low) as an actionable worklist. */
export function ReplenishmentPanel({
  title,
  description,
  items,
  onTransfer,
  emptyMessage,
}: ReplenishmentPanelProps) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-lg text-deep-navy">{title}</h3>
        {description ? <p className="text-sm text-charcoal/60 mt-0.5">{description}</p> : null}
      </div>
      <DataTable
        rows={items}
        rowKey={(i) => `${i.kind}-${i.productId}-${i.variantId ?? ""}-${i.partnerId ?? ""}`}
        emptyMessage={emptyMessage ?? "Nothing needs attention here."}
        columns={[
          {
            key: "label",
            header: "Item",
            render: (i) => (
              <div>
                <p className="font-medium text-deep-navy">{i.label}</p>
                {i.partnerName ? <p className="text-xs text-charcoal/50">{i.partnerName}</p> : null}
              </div>
            ),
          },
          { key: "studio", header: "Studio", render: (i) => String(i.studio) },
          {
            key: "partners",
            header: "Partners",
            render: (i) => String(i.kind === "partner-need" ? i.partnerQty ?? 0 : i.partners),
          },
          { key: "total", header: "Total", render: (i) => String(i.total) },
          { key: "min", header: "Min", render: (i) => String(i.minQuantity) },
          {
            key: "action",
            header: "",
            render: (i) =>
              i.suggestedAction === "Manufacture" || i.suggestedAction === "Reorder / Manufacture" ? (
                <Link href="/manufacture">
                  <Button size="sm" variant="outline">
                    {i.suggestedAction}
                  </Button>
                </Link>
              ) : (
                <Button size="sm" variant="outline" onClick={() => onTransfer(i)}>
                  {i.suggestedAction}
                </Button>
              ),
          },
        ]}
      />
    </section>
  );
}

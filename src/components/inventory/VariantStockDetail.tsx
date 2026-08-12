"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { VariantStockCell } from "@/lib/domain/types";

interface StatBoxProps {
  label: string;
  value: number;
  tone?: "default" | "danger";
}

function StatBox({ label, value, tone = "default" }: StatBoxProps) {
  return (
    <div className="rounded-xl border border-border bg-pale-cream p-3 text-center">
      <p className="text-[11px] uppercase tracking-wider text-charcoal/55">{label}</p>
      <p
        className={`mt-1 font-display text-xl ${
          tone === "danger" ? "text-aarla-red" : "text-deep-navy"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

interface VariantStockDetailProps {
  open: boolean;
  onClose: () => void;
  productTitle: string;
  variantLabel: string;
  cell: VariantStockCell | null;
  onTransfer: () => void;
  onAdjust: () => void;
}

/** Read-only drawer showing a single variant's stock breakdown across every location. */
export function VariantStockDetail({
  open,
  onClose,
  productTitle,
  variantLabel,
  cell,
  onTransfer,
  onAdjust,
}: VariantStockDetailProps) {
  return (
    <Modal
      open={open && Boolean(cell)}
      onClose={onClose}
      title={`${productTitle} — ${variantLabel}`}
      footer={
        <>
          <Button variant="outline" onClick={onTransfer}>
            Transfer
          </Button>
          <Button onClick={onAdjust}>Adjust</Button>
        </>
      }
    >
      {cell ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-charcoal/60">Total on hand</p>
            <p className="font-display text-3xl text-deep-navy">{cell.total}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Available (Studio)" value={cell.available} />
            <StatBox label="Reserved (Channel)" value={cell.reserved} />
            <StatBox label="Damaged" value={cell.damaged} tone={cell.damaged > 0 ? "danger" : "default"} />
          </div>

          <div>
            <h4 className="font-display text-lg text-deep-navy mb-2">By location</h4>
            <ul className="space-y-2 text-sm">
              {cell.byLocation.length ? (
                cell.byLocation.map((loc) => (
                  <li
                    key={loc.locationId}
                    className="flex items-center justify-between gap-3 border-b border-border pb-2"
                  >
                    <span className="text-deep-navy">
                      {loc.locationName}{" "}
                      <span className="text-charcoal/45 text-xs">({loc.kind})</span>
                    </span>
                    <span className="font-medium text-deep-navy">{loc.quantity}</span>
                  </li>
                ))
              ) : (
                <li className="text-charcoal/50">No stock recorded at any location.</li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

"use client";

import { Field, inputClass } from "@/components/ui/FormSection";
import { optionKey, type PartnerStockOption } from "@/lib/domain/partner-stock-options";

export type PartnerDraftLine = {
  productId: string;
  variantId: string;
  productTitle: string;
  variantLabel: string;
  available: number;
  quantity: number;
  sku?: string;
};

type PartnerStockDraftLinesProps = {
  lines: PartnerDraftLine[];
  onQuantityChange: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  /** When false, hide available caps (legacy catalog lines). */
  enforceAvailable?: boolean;
};

export function draftLineKey(line: Pick<PartnerDraftLine, "productId" | "variantId">): string {
  return optionKey(line);
}

export function toDraftLine(option: PartnerStockOption, quantity = 1): PartnerDraftLine {
  return {
    productId: option.productId,
    variantId: option.variantId,
    productTitle: option.productTitle,
    variantLabel: option.variantLabel,
    available: option.available,
    sku: option.sku,
    quantity:
      option.available > 0 ? Math.min(Math.max(1, quantity), option.available) : Math.max(1, quantity),
  };
}

export function PartnerStockDraftLines({
  lines,
  onQuantityChange,
  onRemove,
  enforceAvailable = true,
}: PartnerStockDraftLinesProps) {
  if (!lines.length) {
    return (
      <p className="text-sm text-charcoal/55" data-testid="partner-draft-empty">
        No lines yet — search and add products above.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="partner-draft-lines">
      <p className="text-xs font-semibold uppercase tracking-wider text-charcoal/55">
        Lines ({lines.length})
      </p>
      <ul className="rounded-xl border border-border divide-y divide-border">
        {lines.map((line) => {
          const key = draftLineKey(line);
          return (
            <li key={key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-deep-navy truncate">
                  {line.productTitle}
                  <span className="font-normal text-charcoal/70"> · {line.variantLabel}</span>
                </p>
                {enforceAvailable && line.available > 0 ? (
                  <p className="text-xs text-charcoal/55 mt-0.5">Available {line.available}</p>
                ) : null}
              </div>
              <Field label="Qty">
                <input
                  className={`${inputClass} w-20`}
                  type="number"
                  min={1}
                  max={enforceAvailable && line.available > 0 ? line.available : undefined}
                  value={line.quantity}
                  onChange={(e) => onQuantityChange(key, Number(e.target.value))}
                  data-testid="partner-draft-qty"
                />
              </Field>
              <button
                type="button"
                className="text-xs text-aarla-red hover:underline"
                onClick={() => onRemove(key)}
                data-testid="partner-draft-remove"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

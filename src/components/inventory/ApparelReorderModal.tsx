"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/FormSection";
import type { Product, VariantStockCell } from "@/lib/domain/types";
import {
  buildApparelMatrix,
  type ApparelMatrixRow,
} from "@/lib/domain/inventory-presentation";
import {
  manufactureReorderHref,
  suggestedReorderQty,
} from "@/lib/domain/manufacture-reorder-link";

type Props = {
  open: boolean;
  onClose: () => void;
  product: Product;
  cells: VariantStockCell[];
  /** Prefill: suggest qty for low/zero sizes; leave others at 0. */
  preferRestock?: boolean;
};

/**
 * Colour × Size qty grid for apparel reorder — continues to Needs Making
 * with one or many size/colour lines.
 */
export function ApparelReorderModal({
  open,
  onClose,
  product,
  cells,
  preferRestock = true,
}: Props) {
  const router = useRouter();
  const matrix = useMemo(() => buildApparelMatrix(product, cells), [product, cells]);
  const columns = matrix[0]?.columns ?? [];

  const initialQty = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of matrix) {
      for (const col of columns) {
        const cell = row.cells[col];
        if (!cell) continue;
        if (preferRestock && cell.total > 5) {
          map[cell.variantId] = 0;
        } else {
          map[cell.variantId] = preferRestock ? suggestedReorderQty(cell.total) : 0;
        }
      }
    }
    return map;
  }, [matrix, columns, preferRestock]);

  const [qtyByVariant, setQtyByVariant] = useState<Record<string, number>>(initialQty);

  useEffect(() => {
    if (open) setQtyByVariant(initialQty);
  }, [open, initialQty]);

  const lines = useMemo(() => {
    const out: Array<{ variantId: string; quantity: number; label: string }> = [];
    for (const row of matrix) {
      for (const col of columns) {
        const cell = row.cells[col];
        if (!cell) continue;
        const quantity = Math.floor(Number(qtyByVariant[cell.variantId] ?? 0));
        if (quantity <= 0) continue;
        out.push({
          variantId: cell.variantId,
          quantity,
          label: `${product.title} / ${row.rowLabel} / ${col}`,
        });
      }
    }
    return out;
  }, [matrix, columns, qtyByVariant, product.title]);

  const setCellQty = (variantId: string, value: string) => {
    const n = Number(value);
    setQtyByVariant((prev) => ({
      ...prev,
      [variantId]: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0,
    }));
  };

  const fillSuggested = () => {
    const next: Record<string, number> = {};
    for (const row of matrix) {
      for (const col of columns) {
        const cell = row.cells[col];
        if (!cell) continue;
        next[cell.variantId] = suggestedReorderQty(cell.total);
      }
    }
    setQtyByVariant(next);
  };

  const clearAll = () => {
    const next: Record<string, number> = {};
    for (const row of matrix) {
      for (const col of columns) {
        const cell = row.cells[col];
        if (cell) next[cell.variantId] = 0;
      }
    }
    setQtyByVariant(next);
  };

  const continueToNeeds = () => {
    if (!lines.length) return;
    const href = manufactureReorderHref({
      productId: product.id,
      variantId: lines[0]!.variantId,
      quantity: lines[0]!.quantity,
      label: lines[0]!.label,
      lines,
    });
    onClose();
    router.push(href);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reorder T-shirt sizes"
      wide
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={continueToNeeds}
            disabled={!lines.length}
            data-testid="apparel-reorder-continue"
          >
            Continue to Needs Making ({lines.length})
          </Button>
        </div>
      }
    >
      <div className="space-y-4" data-testid="apparel-reorder-modal">
        <div>
          <p className="font-medium text-deep-navy">{product.title}</p>
          <p className="text-sm text-charcoal/60 mt-1">
            Enter quantities by colour and size. Only filled sizes go to Needs Making.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" type="button" onClick={fillSuggested}>
            Suggest all sizes
          </Button>
          <Button size="sm" variant="outline" type="button" onClick={clearAll}>
            Clear
          </Button>
        </div>

        <ApparelQtyGrid
          matrix={matrix}
          columns={columns}
          qtyByVariant={qtyByVariant}
          onChange={setCellQty}
        />
      </div>
    </Modal>
  );
}

function ApparelQtyGrid({
  matrix,
  columns,
  qtyByVariant,
  onChange,
}: {
  matrix: ApparelMatrixRow[];
  columns: string[];
  qtyByVariant: Record<string, number>;
  onChange: (variantId: string, value: string) => void;
}) {
  if (!matrix.length) {
    return <p className="text-sm text-charcoal/55">No size / colour matrix for this product.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="bg-pale-cream border-b border-border">
            <th className="px-3 py-2 font-medium text-deep-navy/80 text-xs uppercase tracking-wider">
              Colour / Size
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="px-2 py-2 font-medium text-deep-navy/80 text-xs uppercase tracking-wider text-center whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.rowKey} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-medium text-deep-navy whitespace-nowrap">
                {row.rowLabel}
              </td>
              {columns.map((col) => {
                const cell = row.cells[col];
                if (!cell) {
                  return (
                    <td key={col} className="px-2 py-2 text-center text-charcoal/30">
                      —
                    </td>
                  );
                }
                return (
                  <td key={col} className="px-2 py-2 text-center align-top">
                    <div className="inline-flex flex-col items-center gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-charcoal/45">
                        on hand {cell.total}
                      </span>
                      <input
                        type="number"
                        min={0}
                        className={`${inputClass} w-16 text-center px-1 py-1`}
                        value={qtyByVariant[cell.variantId] ?? 0}
                        onChange={(e) => onChange(cell.variantId, e.target.value)}
                        aria-label={`Reorder qty ${row.rowLabel} ${col}`}
                        data-testid={`apparel-reorder-qty-${cell.variantId}`}
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

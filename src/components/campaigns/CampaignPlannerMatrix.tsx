"use client";

import type { CampaignLineBoardRow } from "@/lib/domain/campaign-types";
import {
  buildApparelMatrix,
  buildArtMatrix,
} from "@/lib/domain/inventory-presentation";
import type { Product, VariantStockCell } from "@/lib/domain/types";

export interface PlannerMatrixCell {
  productId: string;
  variantId: string;
  current: number;
  need: number;
  gap: number;
  studioAvailable: number;
}

interface CampaignPlannerMatrixProps {
  product: Product;
  lines: CampaignLineBoardRow[];
  onAllocate?: (variantId: string, need: number) => void;
}

function toStockCells(lines: CampaignLineBoardRow[], productId: string): VariantStockCell[] {
  return lines
    .filter((l) => l.lineItem.productCode === productId && l.lineItem.variantCode)
    .map((l) => ({
      productId,
      variantId: l.lineItem.variantCode!,
      total: l.allocated,
      studio: l.studioAvailable,
      partner: 0,
      channel: 0,
      damaged: 0,
      available: l.need,
      reserved: l.gap,
      byLocation: [],
    }));
}

function cellMeta(
  lines: CampaignLineBoardRow[],
  variantId: string,
): PlannerMatrixCell | null {
  const row = lines.find((l) => l.lineItem.variantCode === variantId);
  if (!row || !row.lineItem.variantCode) return null;
  return {
    productId: row.lineItem.productCode,
    variantId: row.lineItem.variantCode,
    current: row.allocated,
    need: row.need,
    gap: row.gap,
    studioAvailable: row.studioAvailable,
  };
}

/** Colour×Size / Design×Format matrix for campaign planner cells (Current / Need / Gap). */
export function CampaignPlannerMatrix({
  product,
  lines,
  onAllocate,
}: CampaignPlannerMatrixProps) {
  const presentation =
    lines[0]?.presentation ?? "list";
  const stockCells = toStockCells(lines, product.id);
  const matrixRows =
    presentation === "matrix-apparel"
      ? buildApparelMatrix(product, stockCells)
      : presentation === "matrix-art"
        ? buildArtMatrix(product, stockCells)
        : [];

  if (!matrixRows.length) return null;

  const columns = matrixRows[0].columns;
  const rowHeader = presentation === "matrix-art" ? "Design" : "Colour";
  const columnHeader = presentation === "matrix-art" ? "Format" : "Size";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-border bg-warm-cream/60">
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-deep-navy/70 whitespace-nowrap">
                {rowHeader} <span className="text-charcoal/35">/ {columnHeader}</span>
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-deep-navy/70 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixRows.map((row) => (
              <tr key={row.rowKey} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5 font-medium text-deep-navy whitespace-nowrap">
                  {row.rowLabel}
                </td>
                {columns.map((col) => {
                  const stock = row.cells[col];
                  const meta = stock ? cellMeta(lines, stock.variantId) : null;
                  if (!meta) {
                    return (
                      <td key={col} className="px-3 py-2.5 text-center text-charcoal/30">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={col} className="px-2 py-2 text-center align-top">
                      <div className="inline-flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-lg px-1.5 py-1">
                        <span className="text-[10px] uppercase tracking-wide text-charcoal/45">
                          Cur / Need / Gap
                        </span>
                        <span
                          className={`font-medium tabular-nums ${
                            meta.gap > 0 ? "text-aarla-red" : "text-deep-navy"
                          }`}
                        >
                          {meta.current}/{meta.need}/{meta.gap}
                        </span>
                        {meta.need > 0 && onAllocate ? (
                          <button
                            type="button"
                            onClick={() => onAllocate(meta.variantId, meta.need)}
                            className="mt-0.5 text-[10px] text-aarla-red hover:underline"
                          >
                            Allocate need
                          </button>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import type { VariantStockCell } from "@/lib/domain/types";

export interface StockMatrixRow {
  rowKey: string;
  rowLabel: string;
  columns: string[];
  cells: Record<string, VariantStockCell | null>;
}

interface StockMatrixProps {
  rows: StockMatrixRow[];
  /** Header for the leading row-label column, e.g. "Colour" or "Design". */
  rowHeader?: string;
  /** Header for the repeated variant columns, e.g. "Size" or "Format". */
  columnHeader?: string;
  onCellClick?: (cell: VariantStockCell) => void;
  lowStockVariantIds?: Set<string>;
}

/** Renders a Design/Colour × Size (or Format) matrix — cells are clickable when they carry a variant. */
export function StockMatrix({
  rows,
  rowHeader = "Design / Colour",
  columnHeader = "Size",
  onCellClick,
  lowStockVariantIds,
}: StockMatrixProps) {
  if (!rows.length) return null;
  const columns = rows[0].columns;

  return (
    <div className="card-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-pale-cream border-b border-border">
              <th className="px-4 py-3 font-medium text-deep-navy/80 text-xs uppercase tracking-wider whitespace-nowrap">
                {rowHeader} <span className="text-charcoal/35">/ {columnHeader}</span>
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 font-medium text-deep-navy/80 text-xs uppercase tracking-wider text-center whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowKey} className="border-b border-border last:border-0">
                <td className="px-4 py-3.5 font-medium text-deep-navy whitespace-nowrap">
                  {row.rowLabel}
                </td>
                {columns.map((col) => {
                  const cell = row.cells[col];
                  const isLow = cell ? lowStockVariantIds?.has(cell.variantId) : false;
                  return (
                    <td key={col} className="px-4 py-3.5 text-center">
                      {cell ? (
                        <button
                          type="button"
                          onClick={() => onCellClick?.(cell)}
                          className={`inline-flex flex-col items-center min-w-[2.5rem] rounded-lg px-2 py-1 transition hover:bg-pale-cream ${
                            isLow ? "text-aarla-red" : "text-deep-navy"
                          }`}
                        >
                          <span className="font-medium">{cell.total}</span>
                          {isLow ? (
                            <span className="text-[10px] uppercase tracking-wide text-aarla-red">
                              low
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <span className="text-charcoal/30">—</span>
                      )}
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

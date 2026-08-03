"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  pending?: boolean;
  onPageChange: (page: number) => void;
  testId?: string;
};

export function DiagnosticsPagination({
  page,
  totalPages,
  total,
  pageSize,
  pending = false,
  onPageChange,
  testId = "diagnostics-pagination",
}: Props) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 mt-4"
      data-testid={testId}
    >
      <p className="text-sm text-charcoal/65">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid={`${testId}-prev`}
          onClick={() => onPageChange(page - 1)}
          disabled={pending || page <= 1}
          className="inline-flex items-center gap-1 text-sm rounded-full px-3 py-1.5 border border-border text-deep-navy hover:border-aarla-red/40 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Previous
        </button>
        <span className="text-sm text-charcoal/65 tabular-nums">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          data-testid={`${testId}-next`}
          onClick={() => onPageChange(page + 1)}
          disabled={pending || page >= totalPages}
          className="inline-flex items-center gap-1 text-sm rounded-full px-3 py-1.5 border border-border text-deep-navy hover:border-aarla-red/40 disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

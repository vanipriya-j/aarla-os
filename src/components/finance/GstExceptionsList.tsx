"use client";

import type { GstException } from "@/lib/domain/gst-types";

export function GstExceptionsList({ exceptions }: { exceptions: GstException[] }) {
  if (exceptions.length === 0) {
    return (
      <p className="text-sm text-charcoal/55" data-testid="gst-exceptions-empty">
        No exceptions for this period.
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="gst-exceptions">
      {exceptions.map((ex, i) => (
        <li
          key={`${ex.code}-${ex.entityId ?? "x"}-${i}`}
          className="border-b border-border py-2 last:border-0"
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className={`text-xs font-semibold uppercase tracking-wide ${
                ex.severity === "blocker" ? "text-aarla-red" : "text-charcoal/55"
              }`}
            >
              {ex.severity}
            </span>
            <span className="text-xs text-charcoal/45">{ex.code}</span>
          </div>
          <p className="text-sm text-deep-navy mt-0.5">{ex.message}</p>
          <p className="text-xs text-charcoal/50 mt-0.5">{ex.actionHint}</p>
        </li>
      ))}
    </ul>
  );
}

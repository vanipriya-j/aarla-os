"use client";

import type { DailyStripPoint } from "@/lib/domain/operating-metrics-types";

function formatInr(n: number): string {
  if (n >= 1000) return `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `₹${Math.round(n)}`;
}

export function DailyStrip({
  points,
  kind,
}: {
  points: DailyStripPoint[];
  kind: "orders" | "revenue";
}) {
  const values = points.map((p) => (kind === "orders" ? p.orders : p.revenue));
  const max = Math.max(...values, 1);

  return (
    <div className="space-y-2" data-testid={`daily-strip-${kind}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-charcoal/50">
        {kind === "orders" ? "Orders" : "Revenue"} · Mon–Sun
      </p>
      <div className="grid grid-cols-7 gap-2">
        {points.map((p, i) => {
          const v = values[i] ?? 0;
          const h = Math.max(8, Math.round((v / max) * 64));
          return (
            <div
              key={p.date}
              className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 ${
                p.isToday ? "bg-aarla-red/5 ring-1 ring-aarla-red/20" : ""
              } ${p.isFuture ? "opacity-40" : ""}`}
            >
              <div className="h-16 w-full flex items-end justify-center">
                <div
                  className="w-5 rounded-t bg-deep-navy/80"
                  style={{ height: h }}
                  title={String(v)}
                />
              </div>
              <p className="text-[11px] font-medium text-deep-navy">{p.dayLabel}</p>
              <p className="text-[10px] tabular-nums text-charcoal/55">
                {kind === "orders" ? v : formatInr(v)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

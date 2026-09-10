"use client";

import { useDeferredValue, useMemo } from "react";
import { Field, inputClass } from "@/components/ui/FormSection";
import {
  filterStockOptions,
  optionKey,
  type PartnerStockOption,
} from "@/lib/domain/partner-stock-options";

type PartnerStockPickerProps = {
  /** Full candidate list (already stock-filtered when applicable). */
  options: PartnerStockOption[];
  /** When set, search runs against this instead of filtering `options` (lazy catalog). */
  searchOptions?: (query: string) => PartnerStockOption[];
  /** Hide options already on the draft. */
  excludeKeys?: Set<string>;
  query: string;
  onQueryChange: (query: string) => void;
  onAdd: (option: PartnerStockOption) => void;
  requireQuery?: boolean;
  emptyHint?: string;
  testIdPrefix?: string;
};

export function PartnerStockPicker({
  options,
  searchOptions,
  excludeKeys,
  query,
  onQueryChange,
  onAdd,
  requireQuery = true,
  emptyHint = "Type to search available stock…",
  testIdPrefix = "partner-stock",
}: PartnerStockPickerProps) {
  const deferredQuery = useDeferredValue(query.trim());
  const results = useMemo(() => {
    if (requireQuery && deferredQuery.length < 1) return [];
    const raw = searchOptions
      ? searchOptions(deferredQuery)
      : filterStockOptions(options, deferredQuery, 40);
    if (!excludeKeys?.size) return raw.slice(0, 25);
    return raw.filter((o) => !excludeKeys.has(optionKey(o))).slice(0, 25);
  }, [options, searchOptions, deferredQuery, requireQuery, excludeKeys]);

  return (
    <div className="space-y-3">
      <Field label="Add products">
        <input
          className={inputClass}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search to add — e.g. Kolam bottle Blue"
          data-testid={`${testIdPrefix}-product-search`}
          autoComplete="off"
        />
      </Field>

      <div
        className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border"
        data-testid={`${testIdPrefix}-results`}
      >
        {!results.length ? (
          <p className="px-3 py-3 text-sm text-charcoal/55">
            {requireQuery && !deferredQuery
              ? emptyHint
              : options.length || searchOptions
                ? "No matches for that search."
                : "No available stock at this location."}
          </p>
        ) : (
          results.map((o) => (
            <button
              key={optionKey(o)}
              type="button"
              onClick={() => onAdd(o)}
              className="w-full text-left px-3 py-2.5 text-sm transition hover:bg-pale-cream"
              data-testid={`${testIdPrefix}-option`}
            >
              <span className="block text-deep-navy font-medium">
                {o.productTitle}
                <span className="font-normal text-charcoal/70"> · {o.variantLabel}</span>
              </span>
              <span className="block text-xs text-charcoal/55 mt-0.5">
                {o.available > 0 ? `Available ${o.available} · ` : null}
                {o.sku ? `SKU ${o.sku} · ` : null}
                Add
              </span>
            </button>
          ))
        )}
      </div>
      {results.length === 25 ? (
        <p className="text-xs text-charcoal/50">Showing first 25 matches — refine search.</p>
      ) : null}
    </div>
  );
}

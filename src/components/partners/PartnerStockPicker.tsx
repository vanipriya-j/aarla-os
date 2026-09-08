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
  query: string;
  onQueryChange: (query: string) => void;
  selected: PartnerStockOption | null;
  onSelect: (option: PartnerStockOption) => void;
  requireQuery?: boolean;
  emptyHint?: string;
  testIdPrefix?: string;
};

export function PartnerStockPicker({
  options,
  searchOptions,
  query,
  onQueryChange,
  selected,
  onSelect,
  requireQuery = true,
  emptyHint = "Type to search available stock…",
  testIdPrefix = "partner-stock",
}: PartnerStockPickerProps) {
  const deferredQuery = useDeferredValue(query.trim());
  const results = useMemo(() => {
    if (requireQuery && deferredQuery.length < 1) return [];
    if (searchOptions) return searchOptions(deferredQuery);
    return filterStockOptions(options, deferredQuery, 25);
  }, [options, searchOptions, deferredQuery, requireQuery]);

  return (
    <div className="space-y-3">
      <Field label="Search product / variant">
        <input
          className={inputClass}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="e.g. Kolam bottle Blue"
          data-testid={`${testIdPrefix}-product-search`}
          autoComplete="off"
        />
      </Field>

      {selected ? (
        <div
          className="rounded-xl border border-deep-navy/15 bg-pale-cream px-3 py-2 text-sm"
          data-testid={`${testIdPrefix}-selected`}
        >
          <p className="font-medium text-deep-navy">
            {selected.productTitle}
            {selected.variantLabel ? ` · ${selected.variantLabel}` : ""}
          </p>
          <p className="text-xs text-charcoal/55 mt-0.5">
            {selected.available > 0
              ? `Available ${selected.available}`
              : selected.sku
                ? `SKU ${selected.sku}`
                : "Selected"}
          </p>
        </div>
      ) : null}

      <div
        className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border"
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
          results.map((o) => {
            const selectedRow =
              selected != null &&
              o.productId === selected.productId &&
              o.variantId === selected.variantId;
            return (
              <button
                key={optionKey(o)}
                type="button"
                onClick={() => onSelect(o)}
                className={`w-full text-left px-3 py-2.5 text-sm transition ${
                  selectedRow ? "bg-aarla-red/5" : "hover:bg-pale-cream"
                }`}
                data-testid={`${testIdPrefix}-option`}
              >
                <span className="block text-deep-navy font-medium">
                  {o.productTitle}
                  <span className="font-normal text-charcoal/70">
                    {" "}
                    · {o.variantLabel}
                  </span>
                </span>
                <span className="block text-xs text-charcoal/55 mt-0.5">
                  {o.available > 0 ? `Available ${o.available}` : null}
                  {o.available > 0 && o.sku ? " · " : null}
                  {o.sku ? `SKU ${o.sku}` : null}
                </span>
              </button>
            );
          })
        )}
      </div>
      {results.length === 25 ? (
        <p className="text-xs text-charcoal/50">Showing first 25 matches — refine search.</p>
      ) : null}
    </div>
  );
}

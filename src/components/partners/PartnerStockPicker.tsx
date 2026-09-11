"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
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
  /** Add one or many checked results to the draft. */
  onAddMany: (options: PartnerStockOption[]) => void;
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
  onAddMany,
  requireQuery = true,
  emptyHint = "Type to search available stock…",
  testIdPrefix = "partner-stock",
}: PartnerStockPickerProps) {
  const deferredQuery = useDeferredValue(query.trim());
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  const results = useMemo(() => {
    if (requireQuery && deferredQuery.length < 1) return [];
    const raw = searchOptions
      ? searchOptions(deferredQuery)
      : filterStockOptions(options, deferredQuery, 40);
    if (!excludeKeys?.size) return raw.slice(0, 25);
    return raw.filter((o) => !excludeKeys.has(optionKey(o))).slice(0, 25);
  }, [options, searchOptions, deferredQuery, requireQuery, excludeKeys]);

  const resultKeys = useMemo(() => new Set(results.map(optionKey)), [results]);

  // Drop checks that are no longer in the visible result set.
  useEffect(() => {
    setChecked((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (resultKeys.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [resultKeys]);

  const selectedOptions = results.filter(
    (o) => o.available > 0 && checked.has(optionKey(o)),
  );
  const selectableResults = results.filter((o) => o.available > 0);
  const allVisibleChecked =
    selectableResults.length > 0 &&
    selectableResults.every((o) => checked.has(optionKey(o)));

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setChecked((prev) => {
      if (allVisibleChecked) {
        const next = new Set(prev);
        for (const o of selectableResults) next.delete(optionKey(o));
        return next;
      }
      const next = new Set(prev);
      for (const o of selectableResults) next.add(optionKey(o));
      return next;
    });
  };

  const addSelected = () => {
    if (!selectedOptions.length) return;
    onAddMany(selectedOptions);
    setChecked(new Set());
    onQueryChange("");
  };

  return (
    <div className="space-y-3">
      <Field label="Search products">
        <input
          className={inputClass}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search — e.g. Kolam, then multi-select"
          data-testid={`${testIdPrefix}-product-search`}
          autoComplete="off"
        />
      </Field>

      <div
        className="rounded-xl border border-border overflow-hidden"
        data-testid={`${testIdPrefix}-multiselect`}
      >
        {results.length ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-pale-cream/60">
            <label className="flex items-center gap-2 text-xs text-charcoal/70 cursor-pointer">
              <input
                type="checkbox"
                checked={allVisibleChecked}
                onChange={toggleAllVisible}
                data-testid={`${testIdPrefix}-select-all`}
              />
              Select all available ({selectableResults.length})
            </label>
            <span className="text-xs text-charcoal/55">{checked.size} selected</span>
          </div>
        ) : null}

        <div
          className="max-h-48 overflow-y-auto divide-y divide-border"
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
              const key = optionKey(o);
              const isChecked = checked.has(key);
              const unavailable = o.available <= 0;
              return (
                <label
                  key={key}
                  className={`flex items-start gap-3 px-3 py-2.5 text-sm transition ${
                    unavailable
                      ? "opacity-55 cursor-not-allowed"
                      : isChecked
                        ? "bg-aarla-red/5 cursor-pointer"
                        : "hover:bg-pale-cream cursor-pointer"
                  }`}
                  data-testid={`${testIdPrefix}-option`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={isChecked}
                    disabled={unavailable}
                    onChange={() => {
                      if (!unavailable) toggle(key);
                    }}
                    data-testid={`${testIdPrefix}-option-check`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-deep-navy font-medium">
                      {o.productTitle}
                      <span className="font-normal text-charcoal/70">
                        {" "}
                        · {o.variantLabel}
                      </span>
                    </span>
                    <span className="block text-xs text-charcoal/55 mt-0.5">
                      {unavailable
                        ? "No qty here — can't add until stock is available"
                        : `Available ${o.available}`}
                      {o.sku ? ` · SKU ${o.sku}` : null}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!selectedOptions.length}
          onClick={addSelected}
          data-testid={`${testIdPrefix}-add-selected`}
        >
          {selectedOptions.length
            ? `Add ${selectedOptions.length} selected`
            : "Add selected"}
        </Button>
        {results.length === 25 ? (
          <p className="text-xs text-charcoal/50">Showing first 25 — refine search.</p>
        ) : null}
      </div>
    </div>
  );
}

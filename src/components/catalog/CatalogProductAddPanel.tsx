"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PartnerStockPicker } from "@/components/partners/PartnerStockPicker";
import {
  PartnerStockDraftLines,
  draftLineKey,
  toDraftLine,
  type PartnerDraftLine,
} from "@/components/partners/PartnerStockDraftLines";
import {
  optionKey,
  searchCatalogStockOptions,
  type CatalogProductLike,
  type PartnerStockOption,
} from "@/lib/domain/partner-stock-options";

export type CatalogAddLine = {
  productCode: string;
  variantCode: string | null;
  title: string;
  variantLabel: string;
  sku: string;
  quantity: number;
};

type CatalogProductAddPanelProps = {
  products: CatalogProductLike[];
  /** Default qty when a match is added to the draft. */
  defaultQty?: number;
  /** Exclude product×variant keys already on the order. */
  excludeKeys?: Set<string>;
  submitLabel?: string;
  pending?: boolean;
  emptyHint?: string;
  onSubmit: (lines: CatalogAddLine[]) => void | Promise<void>;
  testIdPrefix?: string;
};

function toCatalogAddLines(draft: PartnerDraftLine[]): CatalogAddLine[] {
  return draft.map((l) => ({
    productCode: l.productId,
    variantCode: l.variantId || null,
    title: l.productTitle,
    variantLabel: l.variantLabel === "No variant" ? "" : l.variantLabel,
    sku: l.sku || l.productId,
    quantity: l.quantity,
  }));
}

/**
 * Shopify-style multi-select catalog add: search → check several → draft lines
 * with editable qty → submit once.
 */
export function CatalogProductAddPanel({
  products,
  defaultQty = 20,
  excludeKeys,
  submitLabel = "Add to order",
  pending = false,
  emptyHint = "Type to search the catalog, multi-select, then add…",
  onSubmit,
  testIdPrefix = "catalog-add",
}: CatalogProductAddPanelProps) {
  const [query, setQuery] = useState("");
  const [draftLines, setDraftLines] = useState<PartnerDraftLine[]>([]);

  const catalogSearch = useMemo(
    () => (q: string) => searchCatalogStockOptions(products, q, 25),
    [products],
  );

  const draftExclude = useMemo(() => {
    const keys = new Set(excludeKeys ? [...excludeKeys] : []);
    for (const line of draftLines) keys.add(draftLineKey(line));
    return keys;
  }, [excludeKeys, draftLines]);

  const addDraftLines = (added: PartnerStockOption[]) => {
    if (!added.length) return;
    setDraftLines((prev) => {
      const next = [...prev];
      for (const option of added) {
        const key = optionKey(option);
        const idx = next.findIndex((l) => draftLineKey(l) === key);
        if (idx >= 0) {
          const existing = next[idx]!;
          next[idx] = {
            ...existing,
            quantity: existing.quantity + defaultQty,
            available: 0,
          };
        } else {
          next.push(toDraftLine({ ...option, available: 0 }, defaultQty));
        }
      }
      return next;
    });
    setQuery("");
  };

  return (
    <div className="space-y-4" data-testid={testIdPrefix}>
      <PartnerStockPicker
        options={[]}
        searchOptions={catalogSearch}
        excludeKeys={draftExclude}
        query={query}
        onQueryChange={setQuery}
        onAddMany={addDraftLines}
        requireQuery
        emptyHint={emptyHint}
        testIdPrefix={testIdPrefix}
      />
      <PartnerStockDraftLines
        lines={draftLines}
        enforceAvailable={false}
        onQuantityChange={(key, quantity) => {
          setDraftLines((prev) =>
            prev.map((l) =>
              draftLineKey(l) === key
                ? { ...l, quantity: Math.max(1, Math.floor(quantity) || 1) }
                : l,
            ),
          );
        }}
        onRemove={(key) => {
          setDraftLines((prev) => prev.filter((l) => draftLineKey(l) !== key));
        }}
      />
      <Button
        size="sm"
        disabled={pending || !draftLines.length}
        onClick={() => {
          const lines = toCatalogAddLines(draftLines);
          void Promise.resolve(onSubmit(lines))
            .then(() => {
              setDraftLines([]);
              setQuery("");
            })
            .catch(() => {
              /* keep draft so the user can retry after fixing the error */
            });
        }}
        data-testid={`${testIdPrefix}-submit`}
      >
        {pending
          ? "Saving…"
          : draftLines.length
            ? `${submitLabel} (${draftLines.length})`
            : submitLabel}
      </Button>
    </div>
  );
}

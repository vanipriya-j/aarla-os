"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  listOpenReconciliationsAction,
  listReconciliationItemsAction,
  recordReconciliationCountAction,
  startStudioReconciliationAction,
} from "@/app/actions/inventory-os-actions";

type ReconSummary = {
  id: string;
  status: string;
  reconciliationDate: string;
  startedAt: string;
  notes: string | null;
};

type ReconItem = {
  id: string;
  productId: string;
  variantId: string | null;
  productTitle: string;
  variantLabel: string | null;
  systemQuantitySnapshot: number;
  physicalQuantity: number | null;
  difference: number | null;
  reason: string | null;
  notes: string | null;
};

const COUNT_REASONS = [
  { value: "", label: "—" },
  { value: "counting_error", label: "Counting error" },
  { value: "missing_item", label: "Missing item" },
  { value: "damage_not_recorded", label: "Damage not recorded" },
  { value: "sale_not_recorded", label: "Sale not recorded" },
  { value: "transfer_not_recorded", label: "Transfer not recorded" },
  { value: "receipt_not_recorded", label: "Receipt not recorded" },
  { value: "found_extra_stock", label: "Found extra stock" },
  { value: "other", label: "Other" },
];

export function ReconcileBoard() {
  const [open, setOpen] = useState<ReconSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<ReconItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<
    Record<string, { physical: string; reason: string; notes: string }>
  >({});

  const refreshOpen = useCallback(() => {
    startTransition(async () => {
      const result = await listOpenReconciliationsAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(result.data);
      setError(null);
      if (!activeId && result.data[0]) setActiveId(result.data[0].id);
    });
  }, [activeId]);

  const loadItems = useCallback((id: string) => {
    startTransition(async () => {
      const result = await listReconciliationItemsAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems(result.data);
      const next: Record<string, { physical: string; reason: string; notes: string }> = {};
      for (const item of result.data) {
        next[item.id] = {
          physical: item.physicalQuantity == null ? "" : String(item.physicalQuantity),
          reason: item.reason ?? "",
          notes: item.notes ?? "",
        };
      }
      setDrafts(next);
      setError(null);
    });
  }, []);

  useEffect(() => {
    refreshOpen();
  }, [refreshOpen]);

  useEffect(() => {
    if (activeId) loadItems(activeId);
  }, [activeId, loadItems]);

  const startRecon = () => {
    startTransition(async () => {
      const result = await startStudioReconciliationAction({
        notes: "Studio EOD count",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setToast("Studio reconciliation started — count does not change the ledger until resolved.");
      setActiveId(result.data.reconciliationId);
      refreshOpen();
    });
  };

  const saveCount = (itemId: string) => {
    const draft = drafts[itemId];
    if (!draft || draft.physical.trim() === "") return;
    const physicalQuantity = Number(draft.physical);
    if (!Number.isFinite(physicalQuantity) || physicalQuantity < 0) {
      setError("Physical quantity must be a non-negative number.");
      return;
    }
    startTransition(async () => {
      const result = await recordReconciliationCountAction({
        itemId,
        physicalQuantity,
        reason: draft.reason || null,
        notes: draft.notes || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setToast(`Saved count (Δ ${result.data.difference})`);
      if (activeId) loadItems(activeId);
    });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-deep-navy">Reconcile</h2>
          <p className="text-sm text-charcoal/60 mt-0.5">
            Physical count against a Studio snapshot. Differences are recorded here — the ledger only
            changes when you post an Adjustment.
          </p>
        </div>
        <Button onClick={startRecon} disabled={pending}>
          Start Studio count
        </Button>
      </div>

      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      {toast ? (
        <div className="rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
          {toast}
        </div>
      ) : null}

      {open.length ? (
        <div className="flex flex-wrap gap-2">
          {open.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveId(r.id)}
              className={`text-sm rounded-full px-3 py-1.5 border transition ${
                activeId === r.id
                  ? "bg-deep-navy text-white border-deep-navy"
                  : "border-border bg-white text-charcoal/70 hover:border-deep-navy/40"
              }`}
            >
              {r.reconciliationDate} · {r.status}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-charcoal/50">No open reconciliations.</p>
      )}

      {activeId && items.length ? (
        <DataTable
          rows={items}
          rowKey={(r) => r.id}
          columns={[
            {
              key: "item",
              header: "Item",
              render: (r) => (
                <div>
                  <p className="font-medium text-deep-navy">{r.productTitle}</p>
                  <p className="text-xs text-charcoal/50">{r.variantLabel ?? "—"}</p>
                </div>
              ),
            },
            {
              key: "system",
              header: "System",
              render: (r) => String(r.systemQuantitySnapshot),
            },
            {
              key: "physical",
              header: "Physical",
              render: (r) => (
                <input
                  type="number"
                  min={0}
                  className="w-20 rounded-lg border border-border px-2 py-1 text-sm"
                  value={drafts[r.id]?.physical ?? ""}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [r.id]: { ...(prev[r.id] ?? { reason: "", notes: "" }), physical: e.target.value },
                    }))
                  }
                />
              ),
            },
            {
              key: "diff",
              header: "Δ",
              render: (r) =>
                r.difference == null ? (
                  "—"
                ) : (
                  <StatusChip
                    label={String(r.difference)}
                    tone={r.difference === 0 ? "success" : "warning"}
                  />
                ),
            },
            {
              key: "reason",
              header: "Reason",
              render: (r) => (
                <select
                  className="rounded-lg border border-border px-2 py-1 text-sm max-w-[10rem]"
                  value={drafts[r.id]?.reason ?? ""}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [r.id]: {
                        ...(prev[r.id] ?? { physical: "", notes: "" }),
                        reason: e.target.value,
                      },
                    }))
                  }
                >
                  {COUNT_REASONS.map((opt) => (
                    <option key={opt.value || "blank"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              key: "save",
              header: "",
              render: (r) => (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => saveCount(r.id)}>
                  Save
                </Button>
              ),
            },
          ]}
        />
      ) : activeId ? (
        <p className="text-sm text-charcoal/50">
          {pending ? "Loading count sheet…" : "No Studio stock items on this sheet."}
        </p>
      ) : null}
    </section>
  );
}

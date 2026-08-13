"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/FormSection";
import type { AdjustmentReason, Location, VariantStockCell } from "@/lib/domain/types";

export interface AdjustStockSubmitInput {
  locationId: string;
  systemQty: number;
  physicalQty: number;
  reason: AdjustmentReason;
  notes: string;
}

const REASONS: AdjustmentReason[] = ["missing", "damaged", "count correction", "other"];

interface AdjustStockModalProps {
  open: boolean;
  onClose: () => void;
  productTitle: string;
  variantLabel?: string;
  cell: VariantStockCell | null;
  locations: Location[];
  defaultLocationId?: string;
  onConfirm: (input: AdjustStockSubmitInput) => void | Promise<void>;
}

function systemQtyAt(cell: VariantStockCell | null, locationId: string): number {
  return cell?.byLocation.find((l) => l.locationId === locationId)?.quantity ?? 0;
}

/**
 * Adjust form — captures a physical count and writes a compensating Adjustment movement.
 * Mount fresh per adjustment (e.g. render only while a variant is selected) so defaults
 * re-initialize instead of persisting stale field values across opens.
 */
export function AdjustStockModal({
  open,
  onClose,
  productTitle,
  variantLabel,
  cell,
  locations,
  defaultLocationId,
  onConfirm,
}: AdjustStockModalProps) {
  const initialLocationId =
    defaultLocationId ?? cell?.byLocation[0]?.locationId ?? locations[0]?.id ?? "";
  const [locationId, setLocationId] = useState(initialLocationId);
  const [physicalQty, setPhysicalQty] = useState(() => systemQtyAt(cell, initialLocationId));
  const [reason, setReason] = useState<AdjustmentReason>("count correction");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const systemQty = systemQtyAt(cell, locationId);

  const handleLocationChange = (nextLocationId: string) => {
    setLocationId(nextLocationId);
    setPhysicalQty(systemQtyAt(cell, nextLocationId));
  };

  const delta = physicalQty - systemQty;
  const canSubmit = locationId && delta !== 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm({ locationId, systemQty, physicalQty, reason, notes });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust Stock"
      footer={
        <Button onClick={() => void submit()} disabled={!canSubmit}>
          {submitting ? "Saving…" : "Confirm Adjustment"}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-charcoal/65">
          {productTitle}
          {variantLabel ? ` — ${variantLabel}` : ""}
        </p>
        <Field label="Location">
          <select
            className={selectClass}
            value={locationId}
            onChange={(e) => handleLocationChange(e.target.value)}
            data-testid="adjust-location"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="System quantity">
          <input className={inputClass} value={systemQty} disabled readOnly />
        </Field>
        <Field label="Physical count">
          <input
            className={inputClass}
            type="number"
            min={0}
            value={physicalQty}
            onChange={(e) => setPhysicalQty(Number(e.target.value))}
            data-testid="adjust-physical-qty"
          />
        </Field>
        <Field label="Reason">
          <select
            className={selectClass}
            value={reason}
            onChange={(e) => setReason(e.target.value as AdjustmentReason)}
            data-testid="adjust-reason"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" hint="Optional">
          <textarea
            className={textareaClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="adjust-notes"
          />
        </Field>
        <p className="text-xs text-charcoal/55">
          {delta === 0
            ? "No change — physical count matches the ledger."
            : delta > 0
              ? `Writes an Adjustment of +${delta} (stock found).`
              : `Writes an Adjustment of ${delta} (stock lost).`}
        </p>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/FormSection";
import type { Location } from "@/lib/domain/types";

export interface TransferStockSubmitInput {
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  notes: string;
}

interface TransferStockModalProps {
  open: boolean;
  onClose: () => void;
  productTitle: string;
  variantLabel?: string;
  locations: Location[];
  defaultFromLocationId?: string;
  defaultToLocationId?: string;
  onConfirm: (input: TransferStockSubmitInput) => void | Promise<void>;
}

/**
 * Transfer form — writes a Transfer movement via the parent's `transferStock` call.
 * Mount fresh per transfer (e.g. render only while a transfer context is set) so
 * defaults re-initialize instead of persisting stale field values across opens.
 */
export function TransferStockModal({
  open,
  onClose,
  productTitle,
  variantLabel,
  locations,
  defaultFromLocationId,
  defaultToLocationId,
  onConfirm,
}: TransferStockModalProps) {
  const [fromLocationId, setFromLocationId] = useState(defaultFromLocationId ?? locations[0]?.id ?? "");
  const [toLocationId, setToLocationId] = useState(defaultToLocationId ?? locations[1]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    fromLocationId && toLocationId && fromLocationId !== toLocationId && quantity > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm({ fromLocationId, toLocationId, quantity, notes });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transfer Stock"
      footer={
        <Button onClick={() => void submit()} disabled={!canSubmit}>
          {submitting ? "Transferring…" : "Confirm Transfer"}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-charcoal/65">
          {productTitle}
          {variantLabel ? ` — ${variantLabel}` : ""}
        </p>
        <Field label="From location">
          <select
            className={selectClass}
            value={fromLocationId}
            onChange={(e) => setFromLocationId(e.target.value)}
            data-testid="transfer-from"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To location">
          <select
            className={selectClass}
            value={toLocationId}
            onChange={(e) => setToLocationId(e.target.value)}
            data-testid="transfer-to"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity">
          <input
            className={inputClass}
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            data-testid="transfer-quantity"
          />
        </Field>
        <Field label="Notes" hint="Optional">
          <textarea
            className={textareaClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="transfer-notes"
          />
        </Field>
        {fromLocationId === toLocationId ? (
          <p className="text-xs text-aarla-red">From and to locations must be different.</p>
        ) : null}
      </div>
    </Modal>
  );
}

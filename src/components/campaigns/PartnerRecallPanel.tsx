"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  CampaignBoard,
  CampaignLineBoardRow,
  CampaignPartnerRecallStatus,
} from "@/lib/domain/campaign-types";

const STATUS_OPTIONS: { value: CampaignPartnerRecallStatus; label: string }[] = [
  { value: "AVAILABLE_TO_RECALL", label: "Available to recall" },
  { value: "DO_NOT_RECALL", label: "Do not recall" },
  { value: "RECALL_REQUESTED", label: "Recall requested" },
];

interface PartnerRecallPanelProps {
  board: CampaignBoard;
  pending?: boolean;
  onSave: (input: {
    productCode: string;
    variantCode: string | null;
    partnerCode: string;
    quantity: number;
    status: CampaignPartnerRecallStatus;
  }) => void;
}

export function PartnerRecallPanel({ board, pending, onSave }: PartnerRecallPanelProps) {
  const { currentReadiness, potentialReadiness, trueProcurementGap } = board;
  const linesWithPartners = board.lines.filter(
    (l) => l.partnerHeldTotal > 0 || l.partnerBreakdown.length > 0,
  );

  return (
    <section
      className="rounded-xl border border-border bg-white p-4 space-y-4"
      data-testid="partner-recall-panel"
    >
      <div className="space-y-1">
        <h2 className="font-display text-lg text-deep-navy">Partner inventory recall</h2>
        <p className="text-sm text-charcoal/60">
          Planning only — stock stays at partner until you Transfer. Partner held is
          Potentially Recoverable, not campaign-ready. Ready gate uses Current readiness
          (Studio soft-allocated) only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border border-border bg-soft-beige/60 px-3 py-1">
          Current readiness {currentReadiness.readinessPct}%
        </span>
        <span className="rounded-full border border-border bg-soft-beige/60 px-3 py-1">
          Potential readiness {potentialReadiness.readinessPct}%
        </span>
        <span className="rounded-full border border-border bg-soft-beige/60 px-3 py-1">
          True procurement gap {trueProcurementGap} units
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/inventory"
          className="rounded-full border border-border bg-white px-3 py-1.5 text-deep-navy hover:border-deep-navy"
        >
          Open Transfer
        </Link>
        <Link
          href="/manufacture"
          className="rounded-full border border-border bg-white px-3 py-1.5 text-deep-navy hover:border-deep-navy"
        >
          Manufacture
        </Link>
        <Link
          href="/inventory?tab=replenishment"
          className="rounded-full border border-border bg-white px-3 py-1.5 text-deep-navy hover:border-deep-navy"
        >
          Replenishment
        </Link>
      </div>

      {linesWithPartners.length === 0 ? (
        <p className="text-sm text-charcoal/55">
          No partner-held stock on campaign lines yet. Add lines or transfer inventory to
          partners first.
        </p>
      ) : (
        <div className="space-y-4">
          {linesWithPartners.map((line) => (
            <LineRecallBlock
              key={line.lineItem.id}
              line={line}
              pending={pending}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function LineRecallBlock({
  line,
  pending,
  onSave,
}: {
  line: CampaignLineBoardRow;
  pending?: boolean;
  onSave: PartnerRecallPanelProps["onSave"];
}) {
  const [open, setOpen] = useState(line.partnerHeldTotal > 0 || line.selectedForRecall > 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-left bg-soft-beige/40 hover:bg-soft-beige/70"
      >
        <span className="text-sm font-medium text-deep-navy">
          {line.productTitle}
          {line.variantLabel ? ` · ${line.variantLabel}` : ""}
        </span>
        <span className="text-xs text-charcoal/55">
          Partner held {line.partnerHeldTotal} · Selected {line.selectedForRecall} · True gap{" "}
          {line.trueProcurementGap}
          {" · "}
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open ? (
        <div className="divide-y divide-border">
          {line.partnerBreakdown.length === 0 ? (
            <p className="px-3 py-2 text-sm text-charcoal/55">No partner rows.</p>
          ) : (
            line.partnerBreakdown.map((row) => (
              <PartnerRecallRow
                key={`${row.partnerCode}-${row.quantity}-${row.status}`}
                partnerCode={row.partnerCode}
                partnerName={row.partnerName}
                partnerHeld={row.partnerHeld}
                initialQty={row.quantity}
                initialStatus={row.status}
                pending={pending}
                onSave={(quantity, status) =>
                  onSave({
                    productCode: line.lineItem.productCode,
                    variantCode: line.lineItem.variantCode,
                    partnerCode: row.partnerCode,
                    quantity,
                    status,
                  })
                }
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function PartnerRecallRow({
  partnerName,
  partnerHeld,
  initialQty,
  initialStatus,
  pending,
  onSave,
}: {
  partnerCode: string;
  partnerName: string;
  partnerHeld: number;
  initialQty: number;
  initialStatus: CampaignPartnerRecallStatus;
  pending?: boolean;
  onSave: (quantity: number, status: CampaignPartnerRecallStatus) => void;
}) {
  const [qty, setQty] = useState(String(initialQty));
  const [status, setStatus] = useState<CampaignPartnerRecallStatus>(initialStatus);

  return (
    <div className="flex flex-wrap items-end gap-3 px-3 py-3">
      <div className="min-w-[8rem] flex-1">
        <p className="text-sm text-deep-navy">{partnerName}</p>
        <p className="text-xs text-charcoal/50 mt-0.5">Held {partnerHeld}</p>
      </div>
      <label className="text-xs space-y-1">
        <span className="block text-charcoal/45">Status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CampaignPartnerRecallStatus)}
          className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm min-w-[10rem]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs space-y-1">
        <span className="block text-charcoal/45">Qty</span>
        <input
          type="number"
          min={0}
          max={partnerHeld}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const n = Math.max(0, Math.floor(Number(qty) || 0));
          onSave(n, status);
        }}
        className="rounded-full bg-deep-navy text-white px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}

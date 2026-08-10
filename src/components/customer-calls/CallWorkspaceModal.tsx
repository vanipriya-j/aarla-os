"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  ABANDONED_CART_OUTCOMES,
  DELIVERY_OUTCOMES,
  ISSUE_TYPES,
  REENGAGEMENT_OUTCOMES,
  type CallSegmentType,
  type CustomerCallQueueItem,
  type CustomerCallSegment,
  type CustomerInteraction,
} from "@/lib/domain/customer-calls-types";

export type CallFormState = {
  outcome: string;
  notes: string;
  followUpAt: string;
  issueType: string;
  approximateQuantity: string;
  linkedOrderExternalId: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  item: CustomerCallQueueItem | null;
  segment: CustomerCallSegment | null;
  history: CustomerInteraction[];
  busy?: boolean;
  onSave: (form: CallFormState) => void;
  onSaveAndNext: (form: CallFormState) => void;
};

export function CallWorkspaceModal({
  open,
  onClose,
  item,
  segment,
  history,
  busy,
  onSave,
  onSaveAndNext,
}: Props) {
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [issueType, setIssueType] = useState("");
  const [approximateQuantity, setApproximateQuantity] = useState("");
  const [linkedOrderExternalId, setLinkedOrderExternalId] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const segmentType: CallSegmentType | null = segment?.segmentType ?? null;
  const outcomes = useMemo(() => {
    if (segmentType === "delivery-follow-up") return DELIVERY_OUTCOMES;
    if (segmentType === "re-engagement") return REENGAGEMENT_OUTCOMES;
    if (segmentType === "abandoned-cart") return ABANDONED_CART_OUTCOMES;
    return [];
  }, [segmentType]);

  const showIssue = outcome === "Issue Reported";
  const showRequirement =
    outcome === "Corporate Requirement" || outcome === "Personal Gifting Requirement";
  const showCheckoutLink = outcome === "Send Checkout Link";
  const showLinkedOrder = outcome === "Already Purchased";
  const showFollowUp =
    outcome === "Call Later" || showIssue || showRequirement || outcome === "Interested";

  function reset() {
    setOutcome("");
    setNotes("");
    setFollowUpAt("");
    setIssueType("");
    setApproximateQuantity("");
    setLinkedOrderExternalId("");
    setLinkCopied(false);
  }

  function form(): CallFormState {
    return {
      outcome,
      notes,
      followUpAt,
      issueType,
      approximateQuantity,
      linkedOrderExternalId,
    };
  }

  async function copyCheckoutLink(url: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 2000);
      }
    } catch {
      // Clipboard access denied — the URL is still visible for manual copy.
    }
  }

  if (!item || !segment) {
    return (
      <Modal open={open} onClose={onClose} title="Call workspace">
        <p className="text-sm text-charcoal/60">No call selected.</p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Call — ${item.customerName}`}
      wide
      footer={
        <>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !outcome}
            onClick={() => onSave(form())}
            data-testid="call-save"
          >
            Save
          </Button>
          <Button
            disabled={busy || !outcome}
            onClick={() => onSaveAndNext(form())}
            data-testid="call-save-next"
          >
            Save & Next
          </Button>
        </>
      }
    >
      <div className="space-y-5" data-testid="call-workspace">
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-charcoal/45 uppercase tracking-wide">Phone</p>
            <p className="text-deep-navy font-medium">{item.phone}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal/45 uppercase tracking-wide">Email</p>
            <p className="text-deep-navy">{item.email || "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-charcoal/45 uppercase tracking-wide">Reason</p>
            <p className="text-charcoal/80">{item.reason}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal/45 uppercase tracking-wide">Order</p>
            <p className="text-deep-navy">{item.externalOrderId || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal/45 uppercase tracking-wide">
              {segmentType === "abandoned-cart" ? "Last activity" : "Last order / delivered"}
            </p>
            <p className="text-deep-navy">
              {item.lastOrderDate || "—"}
              {item.deliveredAt ? ` · delivered ${item.deliveredAt.slice(0, 10)}` : ""}
            </p>
          </div>
          {segmentType === "abandoned-cart" ? (
            <div>
              <p className="text-xs text-charcoal/45 uppercase tracking-wide">Cart value</p>
              <p className="text-deep-navy font-medium">
                {item.cartSubtotal != null
                  ? `${item.cartCurrency ?? ""} ${item.cartSubtotal.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}`.trim()
                  : "—"}
              </p>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <p className="text-xs text-charcoal/45 uppercase tracking-wide">Products</p>
            <p className="text-charcoal/80">{item.productsSummary || "—"}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-pale-cream/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-deep-navy/70 mb-1">
            Suggested script
          </p>
          <p className="text-sm text-charcoal/80 leading-relaxed italic">{segment.script}</p>
        </div>

        <Field label="Outcome">
          <select
            className={inputClass}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            data-testid="call-outcome"
          >
            <option value="">Select outcome…</option>
            {outcomes.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>

        {showCheckoutLink && item.checkoutUrl ? (
          <div
            className="rounded-xl border border-aarla-red/25 bg-aarla-red/5 px-4 py-3 space-y-2"
            data-testid="checkout-link-panel"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-aarla-red/80">
              Checkout link — read this out or share it
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-sm text-deep-navy break-all" data-testid="checkout-link-url">
                {item.checkoutUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyCheckoutLink(item.checkoutUrl!)}
                data-testid="checkout-link-copy"
              >
                {linkCopied ? "Copied!" : "Copy link"}
              </Button>
            </div>
          </div>
        ) : null}

        {showLinkedOrder ? (
          <Field label="Shopify order number / id (optional)">
            <input
              className={inputClass}
              type="text"
              value={linkedOrderExternalId}
              onChange={(e) => setLinkedOrderExternalId(e.target.value)}
              placeholder="e.g. #10452"
              data-testid="call-linked-order"
            />
          </Field>
        ) : null}

        {showIssue ? (
          <Field label="Issue type">
            <select
              className={inputClass}
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              data-testid="call-issue-type"
            >
              <option value="">Select issue…</option>
              {ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {showRequirement ? (
          <Field label="Approximate quantity">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={approximateQuantity}
              onChange={(e) => setApproximateQuantity(e.target.value)}
              data-testid="call-qty"
            />
          </Field>
        ) : null}

        {showFollowUp ? (
          <Field label="Follow-up date">
            <input
              className={inputClass}
              type="date"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
              data-testid="call-follow-up"
            />
          </Field>
        ) : null}

        <Field label="Notes">
          <textarea
            className={`${inputClass} min-h-[88px]`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Conversation notes…"
            data-testid="call-notes"
          />
        </Field>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-deep-navy/70 mb-2">
            Previous call history
          </p>
          {history.length === 0 ? (
            <p className="text-sm text-charcoal/55">No previous interactions.</p>
          ) : (
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="rounded-lg border border-border px-3 py-2 text-xs text-charcoal/75"
                  data-testid="call-history-row"
                >
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-deep-navy font-medium">
                      {new Date(h.createdAt).toLocaleString()}
                    </span>
                    <StatusChip label={h.outcome} tone="info" />
                    <span>{h.createdBy}</span>
                  </div>
                  <p className="mt-1">{h.purpose}</p>
                  {h.notes ? <p className="mt-0.5 text-charcoal/60">{h.notes}</p> : null}
                  {h.followUpAt ? <p className="mt-0.5">Follow-up: {h.followUpAt}</p> : null}
                  {h.externalOrderId ? <p className="mt-0.5">Order: {h.externalOrderId}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

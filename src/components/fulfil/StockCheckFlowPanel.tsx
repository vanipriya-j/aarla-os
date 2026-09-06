"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { FulfilmentOrderDetail, FulfilmentLineRow } from "@/lib/repositories/fulfilment";
import {
  resolveOrderStockFlow,
  type LineFlowState,
} from "@/lib/domain/fulfilment-stock-flow";
import type { CustomerFulfilmentOutcome } from "@/lib/domain/fulfilment-types";

type Props = {
  detail: FulfilmentOrderDetail;
  pending: boolean;
  onFoundInStudio: (line: FulfilmentLineRow) => void;
  onNotInStudio: (line: FulfilmentLineRow) => void;
  onAskVani: (line: FulfilmentLineRow) => void;
  onArrangeReseller: (
    line: FulfilmentLineRow,
    partner: { partnerCode: string; partnerName: string; locationCode: string; qty?: number },
  ) => void;
  onResellerMessaged: (taskId: string) => void;
  onResellerReceived: (taskId: string, line: FulfilmentLineRow) => void;
  onCustomerOutcome: (taskId: string, outcome: CustomerFulfilmentOutcome) => void;
};

/**
 * Guided stock-check desk — next steps are buttons in the flow, not prose.
 */
export function StockCheckFlowPanel({
  detail,
  pending,
  onFoundInStudio,
  onNotInStudio,
  onAskVani,
  onArrangeReseller,
  onResellerMessaged,
  onResellerReceived,
  onCustomerOutcome,
}: Props) {
  const flow = useMemo(() => resolveOrderStockFlow(detail), [detail]);
  const lineState = useMemo(() => {
    const map = new Map<string, LineFlowState>();
    for (const l of flow.lines) map.set(l.lineId, l);
    return map;
  }, [flow.lines]);

  return (
    <div className="space-y-4" data-testid="stock-check-flow">
      <div className="rounded-xl border border-border bg-pale-cream/50 px-3 py-3">
        <div className="flex flex-wrap gap-2" role="list" aria-label="Stock check progress">
          {flow.steps.map((s) => (
            <span
              key={s.id}
              role="listitem"
              className={`text-xs rounded-full px-3 py-1.5 border ${
                s.state === "current"
                  ? "bg-deep-navy text-white border-deep-navy"
                  : s.state === "done"
                    ? "bg-white border-deep-navy/40 text-deep-navy"
                    : "bg-white border-border text-charcoal/45"
              }`}
            >
              {s.label}
            </span>
          ))}
        </div>
        <p className="text-sm text-deep-navy mt-2 font-medium" data-testid="stock-flow-step-label">
          {flow.stepLabel}
          {flow.missingCount > 0 ? (
            <span className="text-charcoal/55 font-normal">
              {" "}
              · {flow.missingCount} line{flow.missingCount === 1 ? "" : "s"} still open
            </span>
          ) : null}
        </p>
      </div>

      <ul className="space-y-3">
        {detail.lines.map((line) => {
          const state = lineState.get(line.id)!;
          return (
            <li
              key={line.id}
              className="border border-border rounded-lg px-3 py-3 bg-white"
              data-testid={`stock-line-${line.id}`}
              data-branch={state.branch}
            >
              <p className="font-medium text-deep-navy">
                {line.title}
                {line.variantTitle ? ` — ${line.variantTitle}` : ""} × {line.requiredQuantity}
              </p>
              <p className="text-xs text-charcoal/55 mt-0.5">
                System at Studio:{" "}
                {line.systemStudioQty == null ? "unlinked / unknown" : line.systemStudioQty}
                {" · "}
                Next: {state.nextLabel}
              </p>

              {/* Step A — studio check */}
              {(state.branch === "unchecked" ||
                state.branch === "studio-found" ||
                state.branch === "need-reseller") && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <FlowButton
                    active={state.branch === "studio-found"}
                    tone="navy"
                    disabled={pending}
                    onClick={() => onFoundInStudio(line)}
                  >
                    {state.branch === "studio-found" ? "✓ Found in studio" : "Found in studio"}
                  </FlowButton>
                  <FlowButton
                    active={state.branch === "need-reseller"}
                    tone="danger"
                    disabled={pending}
                    onClick={() => onNotInStudio(line)}
                  >
                    {state.branch === "need-reseller" ? "✓ Not in studio" : "Not in studio"}
                  </FlowButton>
                </div>
              )}

              {/* Step B — after not in studio: reseller OR Ask Vani */}
              {state.branch === "need-reseller" ? (
                <NextStepCard title="Next: where is the rest?">
                  <ResellerArrangeBlock
                    line={line}
                    detail={detail}
                    pending={pending}
                    onArrange={onArrangeReseller}
                  />
                  <div className="pt-2 border-t border-border/70">
                    <p className="text-xs text-charcoal/60 mb-2">
                      Not at any reseller either?
                    </p>
                    <FlowButton disabled={pending} onClick={() => onAskVani(line)}>
                      Ask Vani — speak to customer
                    </FlowButton>
                  </div>
                </NextStepCard>
              ) : null}

              {/* Reseller arranged → message */}
              {state.branch === "reseller-arranged" && state.partnerTask ? (
                <NextStepCard title="Next: message reseller / arrange pick-up">
                  <p className="text-xs text-charcoal/65 mb-2">
                    {state.partnerTask.title} · {state.partnerTask.description}
                  </p>
                  <FlowButton
                    tone="navy"
                    disabled={pending}
                    onClick={() => onResellerMessaged(state.partnerTask!.id)}
                  >
                    Message sent / pick-up arranged
                  </FlowButton>
                </NextStepCard>
              ) : null}

              {/* Reseller in transit → receive */}
              {state.branch === "reseller-in-transit" && state.partnerTask ? (
                <NextStepCard title="Next: mark received when stock arrives at Studio">
                  <FlowButton
                    tone="navy"
                    disabled={pending}
                    onClick={() => onResellerReceived(state.partnerTask!.id, line)}
                  >
                    Mark received from reseller
                  </FlowButton>
                </NextStepCard>
              ) : null}

              {state.branch === "reseller-received" ? (
                <p className="mt-3 text-xs text-deep-navy">✓ Received from reseller</p>
              ) : null}

              {/* Ask Vani → customer outcomes inline */}
              {state.branch === "ask-vani" && state.customerTask ? (
                <NextStepCard title="Next: Ask Vani — what did the customer say?">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["will-wait", "Will wait"],
                        ["chose-alternative", "Take something else"],
                        ["refund-cancel", "Cancel / refund"],
                        ["follow-up-later", "Follow up later"],
                      ] as const
                    ).map(([outcome, label]) => (
                      <FlowButton
                        key={outcome}
                        tone={outcome === "refund-cancel" ? "danger" : "default"}
                        disabled={pending}
                        onClick={() => onCustomerOutcome(state.customerTask!.id, outcome)}
                      >
                        {label}
                      </FlowButton>
                    ))}
                  </div>
                </NextStepCard>
              ) : null}

              {state.branch === "customer-wait" ? (
                <p className="mt-3 text-xs text-charcoal/70">
                  Customer will wait — order stays open until stock is found.
                </p>
              ) : null}
              {state.branch === "customer-alternative" ? (
                <p className="mt-3 text-xs text-deep-navy">
                  Customer takes something else — continue fulfilment.
                </p>
              ) : null}
              {state.branch === "refund" ? (
                <p className="mt-3 text-xs text-aarla-red">Refund / cancel required.</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {flow.step === "ready-to-pack" ? (
        <p
          className="text-sm rounded-lg border border-deep-navy/25 bg-white px-3 py-2 text-deep-navy"
          data-testid="stock-flow-ready-pack"
        >
          All lines resolved — continue with packing below.
        </p>
      ) : null}
    </div>
  );
}

function NextStepCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 rounded-lg border border-deep-navy/20 bg-pale-cream/40 px-3 py-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-deep-navy/80">{title}</p>
      {children}
    </div>
  );
}

function FlowButton({
  children,
  onClick,
  disabled,
  active,
  tone = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: "default" | "navy" | "danger";
}) {
  const base = "text-xs px-3 py-1.5 rounded-full border disabled:opacity-50";
  const styles =
    active && tone === "navy"
      ? "border-deep-navy bg-deep-navy text-white"
      : active && tone === "danger"
        ? "border-aarla-red bg-aarla-red/10 text-aarla-red"
        : tone === "navy"
          ? "border-deep-navy text-deep-navy bg-white"
          : tone === "danger"
            ? "border-aarla-red/50 text-aarla-red bg-white"
            : "border-border bg-white text-deep-navy";
  return (
    <button type="button" disabled={disabled} className={`${base} ${styles}`} onClick={onClick}>
      {children}
    </button>
  );
}

function ResellerArrangeBlock({
  line,
  detail,
  pending,
  onArrange,
}: {
  line: FulfilmentLineRow;
  detail: FulfilmentOrderDetail;
  pending: boolean;
  onArrange: Props["onArrangeReseller"];
}) {
  const [manualCode, setManualCode] = useState("");
  const matched = line.partnerStock;
  const locations = detail.resellerLocations ?? [];

  return (
    <div className="space-y-2">
      {matched.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs text-charcoal/65">Matched reseller stock</p>
          {matched.map((p) => (
            <div
              key={`${p.partnerCode}-${p.locationCode}`}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <span>
                {p.partnerName} — {p.qty} on hand
              </span>
              <FlowButton
                tone="navy"
                disabled={pending}
                onClick={() => onArrange(line, p)}
              >
                Arrange from {p.partnerName}
              </FlowButton>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-charcoal/55">
          No automatic reseller match for this title — pick a reseller below.
        </p>
      )}

      {locations.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <label className="text-xs text-charcoal/60">
            Reseller location
            <select
              className="mt-1 block min-w-[14rem] rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              data-testid="stock-reseller-select"
            >
              <option value="">Select…</option>
              {locations.map((loc) => (
                <option
                  key={`${loc.partnerCode}-${loc.locationCode}`}
                  value={`${loc.partnerCode}::${loc.locationCode}`}
                >
                  {loc.partnerName} ({loc.locationCode})
                </option>
              ))}
            </select>
          </label>
          <FlowButton
            tone="navy"
            disabled={pending || !manualCode}
            onClick={() => {
              const [partnerCode, locationCode] = manualCode.split("::");
              const loc = locations.find(
                (l) => l.partnerCode === partnerCode && l.locationCode === locationCode,
              );
              if (!loc) return;
              onArrange(line, { ...loc, qty: line.requiredQuantity });
            }}
          >
            Arrange from selected reseller
          </FlowButton>
        </div>
      ) : (
        <p className="text-xs text-charcoal/55">
          No partner locations set up yet — add partners under Partners, or Ask Vani.
        </p>
      )}
    </div>
  );
}

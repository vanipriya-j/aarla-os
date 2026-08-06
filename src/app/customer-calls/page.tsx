"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { FormSection } from "@/components/ui/FormSection";
import { Modal } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/StatusChip";
import { CallsQueueTable } from "@/components/customer-calls/CallsQueueTable";
import {
  CallWorkspaceModal,
  type CallFormState,
} from "@/components/customer-calls/CallWorkspaceModal";
import { CommerceSyncProvider } from "@/components/customer-calls/CommerceSyncProvider";
import { CommerceSyncBar } from "@/components/customer-calls/CommerceSyncBar";
import { ShopifySyncPanel } from "@/components/customer-calls/ShopifySyncPanel";
import { DelhiverySyncPanel } from "@/components/customer-calls/DelhiverySyncPanel";
import {
  callLaterCustomerCallAction,
  getCustomerCallHistoryAction,
  getCustomerCallsDashboardAction,
  getCustomerCallsWorkspaceAction,
  refreshCustomerCallQueuesAction,
  saveCustomerCallAndNextAction,
  saveCustomerCallOutcomeAction,
  skipCustomerCallAction,
  startCustomerCallAction,
} from "@/app/actions/customer-calls-actions";
import type {
  CallSegmentType,
  CallsDashboardCounts,
  CallQueueGenerationSummary,
  CustomerCallQueueItem,
  CustomerCallSegment,
  CustomerInteraction,
} from "@/lib/domain/customer-calls-types";
import { Phone, RefreshCw } from "lucide-react";

const STAGES = [
  { id: "shopify", label: "Shopify" },
  { id: "shipments", label: "Shipments" },
  { id: "delivery-follow-up", label: "Delivery Follow-up" },
  { id: "re-engagement", label: "Re-engagement" },
] as const;

type StageId = (typeof STAGES)[number]["id"];

function isCallStage(stage: StageId): stage is CallSegmentType {
  return stage === "delivery-follow-up" || stage === "re-engagement";
}

export default function CustomerCallsPage() {
  const [stage, setStage] = useState<StageId>("delivery-follow-up");
  const [visited, setVisited] = useState<Set<StageId>>(
    () => new Set<StageId>(["delivery-follow-up"]),
  );
  const [counts, setCounts] = useState<CallsDashboardCounts | null>(null);
  const [segment, setSegment] = useState<CustomerCallSegment | null>(null);
  const [queue, setQueue] = useState<CustomerCallQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [queueGen, setQueueGen] = useState<CallQueueGenerationSummary | null>(null);

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<CustomerCallQueueItem | null>(null);
  const [activeSegment, setActiveSegment] = useState<CustomerCallSegment | null>(null);
  const [history, setHistory] = useState<CustomerInteraction[]>([]);
  const [historyOnly, setHistoryOnly] = useState<CustomerInteraction[] | null>(null);

  const loadSeq = useRef(0);

  const loadWorkspace = useCallback(
    async (opts?: { regenerate?: boolean; segmentType?: CallSegmentType }) => {
      const segmentType = opts?.segmentType ?? "delivery-follow-up";
      const seq = ++loadSeq.current;
      setLoadingQueue(true);
      try {
        let genError: string | null = null;
        // Only rebuild queues when explicitly asked — not on every tab open.
        if (opts?.regenerate) {
          const gen = await refreshCustomerCallQueuesAction();
          if (seq !== loadSeq.current) return;
          if (!gen.ok) genError = gen.error;
          else setQueueGen(gen.data);
        }
        const dash = await getCustomerCallsDashboardAction();
        if (seq !== loadSeq.current) return;
        if (dash.ok) setCounts(dash.data.counts);
        const ws = await getCustomerCallsWorkspaceAction(segmentType);
        if (seq !== loadSeq.current) return;
        if (!ws.ok) {
          setError(ws.error);
          return;
        }
        setError(genError);
        setSegment(ws.data.segment);
        setQueue(ws.data.queue);
        setCounts(ws.data.counts);
      } finally {
        if (seq === loadSeq.current) setLoadingQueue(false);
      }
    },
    [],
  );

  const selectStage = useCallback(
    (next: StageId) => {
      setStage(next);
      setVisited((prev) => {
        if (prev.has(next)) return prev;
        const copy = new Set(prev);
        copy.add(next);
        return copy;
      });
      if (isCallStage(next)) {
        void loadWorkspace({ segmentType: next });
      }
    },
    [loadWorkspace],
  );

  // Initial Delivery Follow-up queue (read-only — no regenerate).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace({ segmentType: "delivery-follow-up" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  async function openCall(id: string) {
    const res = await startCustomerCallAction(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setActiveItem(res.data.item);
    setActiveSegment(res.data.segment);
    setHistory(res.data.history);
    setWorkspaceOpen(true);
    if (isCallStage(stage)) void loadWorkspace({ segmentType: stage });
  }

  function toInput(form: CallFormState) {
    if (!activeItem) throw new Error("No active call");
    return {
      queueItemId: activeItem.id,
      outcome: form.outcome,
      notes: form.notes || undefined,
      followUpAt: form.followUpAt || null,
      issueType: form.issueType || null,
      approximateQuantity: form.approximateQuantity
        ? Number(form.approximateQuantity)
        : null,
      requirementType:
        form.outcome === "Corporate Requirement"
          ? "corporate"
          : form.outcome === "Personal Gifting Requirement"
            ? "personal-gifting"
            : null,
    };
  }

  async function handleSave(form: CallFormState) {
    const res = await saveCustomerCallOutcomeAction(toInput(form));
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setWorkspaceOpen(false);
    setActiveItem(null);
    if (isCallStage(stage)) void loadWorkspace({ segmentType: stage });
  }

  async function handleSaveAndNext(form: CallFormState) {
    const res = await saveCustomerCallAndNextAction(toInput(form));
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.data.next) {
      setActiveItem(res.data.next);
      setActiveSegment(res.data.segment);
      setHistory(res.data.history);
      setWorkspaceOpen(true);
    } else {
      setWorkspaceOpen(false);
      setActiveItem(null);
    }
    if (isCallStage(stage)) void loadWorkspace({ segmentType: stage });
  }

  function renderQueueStage(callStage: CallSegmentType) {
    const active = stage === callStage;
    if (!visited.has(callStage)) return null;
    return (
      <div
        className={`space-y-6 ${active ? "" : "hidden"}`}
        data-testid={`stage-${callStage}`}
        aria-hidden={!active}
      >
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {callStage === "delivery-follow-up" ? (
            <SummaryCard
              label="Delivery Calls Pending"
              value={String(counts?.deliveryPending ?? "—")}
              icon={Phone}
            />
          ) : (
            <SummaryCard
              label="Re-engagement Calls Pending"
              value={String(counts?.reengagementPending ?? "—")}
              icon={Phone}
            />
          )}
          <SummaryCard
            label="Calls Completed Today"
            value={String(counts?.completedToday ?? "—")}
          />
          <SummaryCard
            label={callStage === "delivery-follow-up" ? "Issues Raised" : "Follow-ups Due"}
            value={String(
              callStage === "delivery-follow-up"
                ? (counts?.issuesRaised ?? "—")
                : (counts?.followUpsDue ?? "—"),
            )}
          />
        </div>

        <FormSection
          title={
            active
              ? (segment?.name ?? "Queue")
              : callStage === "delivery-follow-up"
                ? "Delivery Follow-up"
                : "Re-engagement"
          }
          description={
            active && segment
              ? `${segment.description} Built from synced Shopify + Delhivery data.`
              : "Built from synced Shopify + Delhivery data."
          }
        >
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button
              type="button"
              data-testid={active ? "refresh-call-queues" : undefined}
              onClick={() =>
                void loadWorkspace({ regenerate: true, segmentType: callStage })
              }
              disabled={loadingQueue}
              className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 border border-border text-deep-navy hover:border-aarla-red/40 disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${loadingQueue && active ? "animate-spin" : ""}`}
                aria-hidden
              />
              {loadingQueue && active ? "Refreshing queues…" : "Refresh call queues"}
            </button>
            {queueGen && active ? (
              <p
                className="text-xs text-charcoal/55"
                data-testid="call-queue-generation-summary"
              >
                Live queues: {queueGen.deliveryCandidates} delivery
                {queueGen.deliveryMissingPhone
                  ? ` (${queueGen.deliveryMissingPhone} missing phone)`
                  : ""}
                {" · "}
                {queueGen.reengagementCandidates} re-engagement
                {queueGen.seedPendingCleared
                  ? ` · cleared ${queueGen.seedPendingCleared} demo rows`
                  : ""}
                {!queueGen.commercePresent
                  ? " · no synced commerce yet (Sync All first)"
                  : ""}
              </p>
            ) : null}
            {loadingQueue && active ? (
              <StatusChip label="Loading queue…" tone="neutral" />
            ) : null}
          </div>
          {error && active ? <p className="text-sm text-aarla-red mb-3">{error}</p> : null}
          {active ? (
            <CallsQueueTable
              rows={queue}
              onStart={openCall}
              onCallLater={async (id) => {
                const date = new Date();
                date.setDate(date.getDate() + 2);
                const res = await callLaterCustomerCallAction(
                  id,
                  date.toISOString().slice(0, 10),
                  "Quick Call Later from queue",
                );
                if (!res.ok) setError(res.error);
                else void loadWorkspace({ segmentType: callStage });
              }}
              onSkip={async (id) => {
                const res = await skipCustomerCallAction(id);
                if (!res.ok) setError(res.error);
                else void loadWorkspace({ segmentType: callStage });
              }}
              onHistory={async (customerId) => {
                const res = await getCustomerCallHistoryAction(customerId);
                if (!res.ok) setError(res.error);
                else setHistoryOnly(res.data);
              }}
            />
          ) : null}
        </FormSection>
      </div>
    );
  }

  return (
    <>
      <Header
        title="Customer Calls"
        subtitle="Work one stage at a time — sync commerce, then call from the live queues."
      />
      <main
        className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl"
        data-testid="customer-calls-page"
      >
        <CommerceSyncProvider>
          <div className="space-y-3" data-testid="customer-calls-stages">
            <div className="flex flex-wrap gap-2" data-testid="calls-tabs" role="tablist">
              {STAGES.map((s) => {
                const active = stage === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid={`tab-${s.id}`}
                    onClick={() => selectStage(s.id)}
                    className={`text-sm rounded-full px-4 py-2 border transition ${
                      active
                        ? "bg-aarla-red text-white border-aarla-red"
                        : "border-border text-deep-navy hover:border-aarla-red/40 bg-white"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-charcoal/50">
              {stage === "shopify"
                ? "Stage 1 — Sync Shopify customers and orders."
                : stage === "shipments"
                  ? "Stage 2 — Track every Delhivery AWB in the database (not just the last Shopify page)."
                  : stage === "delivery-follow-up"
                    ? "Stage 3 — Call customers with recent deliveries. Click Refresh call queues after syncing."
                    : "Stage 4 — Re-engage buyers with no purchase in 90+ days."}
            </p>
          </div>

          {error && !isCallStage(stage) ? (
            <p className="text-sm text-aarla-red">{error}</p>
          ) : null}

          {visited.has("shopify") ? (
            <div
              className={`space-y-6 ${stage === "shopify" ? "" : "hidden"}`}
              data-testid="stage-shopify"
              aria-hidden={stage !== "shopify"}
            >
              <CommerceSyncBar />
              <ShopifySyncPanel />
            </div>
          ) : null}

          {visited.has("shipments") ? (
            <div
              className={`space-y-6 ${stage === "shipments" ? "" : "hidden"}`}
              data-testid="stage-shipments"
              aria-hidden={stage !== "shipments"}
            >
              <DelhiverySyncPanel />
            </div>
          ) : null}

          {renderQueueStage("delivery-follow-up")}
          {renderQueueStage("re-engagement")}
        </CommerceSyncProvider>
      </main>

      <CallWorkspaceModal
        open={workspaceOpen}
        onClose={() => {
          setWorkspaceOpen(false);
          setActiveItem(null);
          if (isCallStage(stage)) void loadWorkspace({ segmentType: stage });
        }}
        item={activeItem}
        segment={activeSegment}
        history={history}
        onSave={handleSave}
        onSaveAndNext={handleSaveAndNext}
      />

      <Modal
        open={Boolean(historyOnly)}
        onClose={() => setHistoryOnly(null)}
        title="Call history"
      >
        {historyOnly && historyOnly.length === 0 ? (
          <p className="text-sm text-charcoal/60">No interactions yet.</p>
        ) : (
          <ul className="space-y-2">
            {historyOnly?.map((h) => (
              <li key={h.id} className="border border-border rounded-lg px-3 py-2 text-sm">
                <p className="font-medium text-deep-navy">
                  {new Date(h.createdAt).toLocaleString()} · {h.outcome}
                </p>
                <p className="text-xs text-charcoal/60 mt-1">
                  {h.purpose} · {h.createdBy}
                  {h.followUpAt ? ` · follow-up ${h.followUpAt}` : ""}
                  {h.externalOrderId ? ` · ${h.externalOrderId}` : ""}
                </p>
                {h.notes ? <p className="text-sm mt-1 text-charcoal/75">{h.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
import { ShopifySyncPanel } from "@/components/customer-calls/ShopifySyncPanel";
import { DelhiverySyncPanel } from "@/components/customer-calls/DelhiverySyncPanel";
import {
  callLaterCustomerCallAction,
  getCustomerCallHistoryAction,
  getCustomerCallsDashboardAction,
  getCustomerCallsWorkspaceAction,
  saveCustomerCallAndNextAction,
  saveCustomerCallOutcomeAction,
  skipCustomerCallAction,
  startCustomerCallAction,
} from "@/app/actions/customer-calls-actions";
import type {
  CallSegmentType,
  CallsDashboardCounts,
  CustomerCallQueueItem,
  CustomerCallSegment,
  CustomerInteraction,
} from "@/lib/domain/customer-calls-types";
import { Phone } from "lucide-react";

export default function CustomerCallsPage() {
  const [tab, setTab] = useState<CallSegmentType>("delivery-follow-up");
  const [counts, setCounts] = useState<CallsDashboardCounts | null>(null);
  const [segment, setSegment] = useState<CustomerCallSegment | null>(null);
  const [queue, setQueue] = useState<CustomerCallQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<CustomerCallQueueItem | null>(null);
  const [activeSegment, setActiveSegment] = useState<CustomerCallSegment | null>(null);
  const [history, setHistory] = useState<CustomerInteraction[]>([]);
  const [historyOnly, setHistoryOnly] = useState<CustomerInteraction[] | null>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const dash = await getCustomerCallsDashboardAction();
      if (dash.ok) setCounts(dash.data.counts);
      const ws = await getCustomerCallsWorkspaceAction(tab);
      if (!ws.ok) {
        setError(ws.error);
        return;
      }
      setError(null);
      setSegment(ws.data.segment);
      setQueue(ws.data.queue);
      setCounts(ws.data.counts);
    });
  }, [tab]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    refresh();
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
    refresh();
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
    refresh();
  }

  return (
    <>
      <Header
        title="Customer Calls"
        subtitle="Delivery follow-ups and gentle re-engagement — one call at a time."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl" data-testid="customer-calls-page">
        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <SummaryCard
            label="Delivery Calls Pending"
            value={String(counts?.deliveryPending ?? "—")}
            icon={Phone}
          />
          <SummaryCard
            label="Re-engagement Calls Pending"
            value={String(counts?.reengagementPending ?? "—")}
          />
          <SummaryCard
            label="Calls Completed Today"
            value={String(counts?.completedToday ?? "—")}
          />
          <SummaryCard label="Issues Raised" value={String(counts?.issuesRaised ?? "—")} />
          <SummaryCard label="Follow-ups Due" value={String(counts?.followUpsDue ?? "—")} />
        </div>

        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}

        <ShopifySyncPanel />
        <DelhiverySyncPanel />

        <div className="flex flex-wrap gap-2" data-testid="calls-tabs">
          {(
            [
              ["delivery-follow-up", "Delivery Follow-up"],
              ["re-engagement", "Re-engagement — 90 Days"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              data-testid={`tab-${value}`}
              onClick={() => setTab(value)}
              className={`text-sm rounded-full px-4 py-2 border transition ${
                tab === value
                  ? "bg-aarla-red text-white border-aarla-red"
                  : "border-border text-deep-navy hover:border-aarla-red/40"
              }`}
            >
              {label}
            </button>
          ))}
          {pending ? <StatusChip label="Refreshing…" tone="neutral" /> : null}
        </div>

        <FormSection
          title={segment?.name ?? "Queue"}
          description={segment?.description ?? "Load a segment to see pending calls."}
        >
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
              else refresh();
            }}
            onSkip={async (id) => {
              const res = await skipCustomerCallAction(id);
              if (!res.ok) setError(res.error);
              else refresh();
            }}
            onHistory={async (customerId) => {
              const res = await getCustomerCallHistoryAction(customerId);
              if (!res.ok) setError(res.error);
              else setHistoryOnly(res.data);
            }}
          />
        </FormSection>
      </main>

      <CallWorkspaceModal
        open={workspaceOpen}
        onClose={() => {
          setWorkspaceOpen(false);
          setActiveItem(null);
          refresh();
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

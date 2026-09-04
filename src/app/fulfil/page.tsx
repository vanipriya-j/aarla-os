"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  confirmHandoverAction,
  confirmPickingAction,
  decidePackingAction,
  decideShippingAction,
  escalateFounderAvailabilityAction,
  getFulfilmentDetailAction,
  getPackingSuggestionsAction,
  listFulfilmentWorkbenchAction,
  markStorePickupProgressAction,
  receivePartnerRecallAction,
  recordCustomerOutcomeAction,
  recordFounderDecisionAction,
  requestPartnerRecallAction,
  saveManualCourierAction,
  setLinePhysicalCheckAction,
  syncIncomingFulfilmentOrdersAction,
} from "@/app/actions/fulfilment-actions";
import type { FulfilmentOrderDetail, FulfilmentOrderListItem } from "@/lib/repositories/fulfilment";
import {
  FULFILMENT_SHIPPING_METHODS,
  FULFILMENT_TABS,
  fulfilmentStatusLabel,
  fulfilmentTabLabel,
  type FulfilmentShippingMethod,
  type FulfilmentTab,
} from "@/lib/domain/fulfilment-types";
import {
  PACKING_QUICK_ADD_ITEMS,
  buildPackingActual,
  packingLineSignature,
} from "@/lib/domain/fulfilment-decisions";
import { CheckCircle2, Loader2, Package, Plus, RefreshCw, Truck, X } from "lucide-react";

export default function FulfilOrdersPage() {
  const [tab, setTab] = useState<FulfilmentTab>("stock-check");
  const [rows, setRows] = useState<FulfilmentOrderListItem[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [pastCutoff, setPastCutoff] = useState(false);
  const [cutoffLabel, setCutoffLabel] = useState("12:30 PM Asia/Kolkata");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FulfilmentOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [packHint, setPackHint] = useState<{
    packing: {
      cover: string;
      materials: Array<{ label: string; code?: string }>;
      notes: string[];
      learnedFromNote?: string | null;
      signature?: string;
    };
    freebie: { label: string; estimatedCost: number | null } | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [awbDraft, setAwbDraft] = useState("");
  const [courierDraft, setCourierDraft] = useState("");
  const [shipMethod, setShipMethod] = useState<FulfilmentShippingMethod>("delhivery-surface");
  const [showPackChange, setShowPackChange] = useState(false);
  const [packItems, setPackItems] = useState<string[]>([""]);
  const [packReason, setPackReason] = useState("");

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  const autoPullDoneRef = useRef(false);

  const reloadList = useCallback((nextTab = tab) => {
    startTransition(async () => {
      setBusyLabel("Loading orders…");
      const res = await listFulfilmentWorkbenchAction(nextTab);
      setBusyLabel(null);
      setListLoaded(true);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setRows(res.data.rows);
      setPastCutoff(res.data.pastCutoff);
      setCutoffLabel(res.data.cutoffLabel);
    });
  }, [tab]);

  const openDetail = useCallback((id: string) => {
    setSelectedId(id);
    setDetail(null);
    setPackHint(null);
    setShowPackChange(false);
    setPackReason("");
    setDetailLoading(true);
    setError(null);
    startTransition(async () => {
      setBusyLabel("Opening order…");
      const [d, p] = await Promise.all([
        getFulfilmentDetailAction(id),
        getPackingSuggestionsAction(id),
      ]);
      setBusyLabel(null);
      setDetailLoading(false);
      if (!d.ok) {
        setError(d.error);
        return;
      }
      setDetail(d.data);
      if (p.ok) {
        setPackHint({
          packing: p.data.packing,
          freebie: p.data.freebie
            ? { label: p.data.freebie.label, estimatedCost: p.data.freebie.estimatedCost }
            : null,
        });
        setPackItems(
          p.data.packing.materials.map((m) => m.label).filter(Boolean).length > 0
            ? p.data.packing.materials.map((m) => m.label)
            : [p.data.packing.cover],
        );
      }
      if (d.data?.shippingMethod) setShipMethod(d.data.shippingMethod);
      setAwbDraft(d.data?.awb ?? "");
      setCourierDraft(d.data?.courierProvider ?? "");
    });
  }, []);

  useEffect(() => {
    setListLoaded(false);
    if (autoPullDoneRef.current) {
      reloadList(tab);
      return;
    }
    autoPullDoneRef.current = true;
    startTransition(async () => {
      setBusyLabel("Pulling open Shopify orders…");
      const pull = await syncIncomingFulfilmentOrdersAction();
      setBusyLabel(null);
      if (!pull.ok) {
        setError(pull.error);
        reloadList(tab);
        return;
      }
      const parts: string[] = [];
      if (pull.data.created > 0) {
        parts.push(`Loaded ${pull.data.created} open order(s) into Fulfil`);
      }
      if (pull.data.archived > 0) {
        parts.push(`cleared ${pull.data.archived} already fulfilled`);
      }
      if (parts.length) {
        setStatus(`${parts.join("; ")}.`);
      } else {
        setStatus(
          "No new open orders to pull — Weekly ORDERS counts all valid sales (including already fulfilled). Fulfil only shows Unfulfilled / Partially fulfilled.",
        );
      }
      reloadList(tab);
    });
  }, [tab, reloadList]);

  function runAction(label: string, fn: () => Promise<void>) {
    startTransition(async () => {
      setBusyLabel(label);
      setError(null);
      try {
        await fn();
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function applyDetailResult(
    res: { ok: true; data: FulfilmentOrderDetail | null } | { ok: false; error: string },
    successStatus?: string,
  ) {
    if (!res.ok) {
      setError(res.error);
    } else {
      setDetail(res.data);
      if (successStatus) setStatus(successStatus);
      if (res.data) {
        const p = await getPackingSuggestionsAction(res.data.id);
        if (p.ok) {
          setPackHint({
            packing: p.data.packing,
            freebie: p.data.freebie
              ? { label: p.data.freebie.label, estimatedCost: p.data.freebie.estimatedCost }
              : null,
          });
          setPackItems(
            p.data.packing.materials.map((m) => m.label).filter(Boolean).length > 0
              ? p.data.packing.materials.map((m) => m.label)
              : [p.data.packing.cover],
          );
        }
      }
    }
    const list = await listFulfilmentWorkbenchAction(tab);
    setListLoaded(true);
    if (list.ok) {
      setRows(list.data.rows);
      setPastCutoff(list.data.pastCutoff);
      setCutoffLabel(list.data.cutoffLabel);
    }
  }

  return (
    <>
      <Header
        title="Fulfil Orders"
        subtitle="Pulls Unfulfilled + Partially fulfilled from synced Shopify orders → stock check → pick → pack → ship. Weekly ORDERS counts all valid sales (including already fulfilled) — different set."
      />

      <div className="px-6 py-6 space-y-5" data-testid="fulfil-orders-page">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="fulfil-sync-incoming"
            disabled={pending}
            onClick={() => {
              runAction("Pulling open Shopify orders…", async () => {
                const res = await syncIncomingFulfilmentOrdersAction();
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                const parts = [`Pulled ${res.data.created} open order(s)`];
                if (res.data.archived > 0) {
                  parts.push(`cleared ${res.data.archived} already fulfilled`);
                }
                setStatus(`${parts.join("; ")}.`);
                const list = await listFulfilmentWorkbenchAction(tab);
                setListLoaded(true);
                if (list.ok) {
                  setRows(list.data.rows);
                  setPastCutoff(list.data.pastCutoff);
                  setCutoffLabel(list.data.cutoffLabel);
                }
              });
            }}
            className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white hover:bg-deep-navy/90 disabled:opacity-60"
          >
            {pending && busyLabel?.startsWith("Pulling") ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Pull open orders
          </button>
          <StatusChip
            label={pastCutoff ? `Past cut-off (${cutoffLabel})` : `Before cut-off (${cutoffLabel})`}
            tone={pastCutoff ? "warning" : "info"}
          />
          {busyLabel ? (
            <p className="inline-flex items-center gap-2 text-sm text-deep-navy" data-testid="fulfil-busy">
              <Loader2 className="h-4 w-4 animate-spin" />
              {busyLabel}
            </p>
          ) : null}
          {status ? <p className="text-sm text-charcoal/70">{status}</p> : null}
          {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2" data-testid="fulfil-tabs">
          {FULFILMENT_TABS.map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`fulfil-tab-${t}`}
              onClick={() => {
                setTab(t);
                setSelectedId(null);
                setDetail(null);
                setDetailLoading(false);
                setPackHint(null);
              }}
              className={`text-sm px-3 py-1.5 rounded-full border ${
                tab === t
                  ? "border-deep-navy bg-deep-navy text-white"
                  : "border-border text-deep-navy hover:border-aarla-red/40"
              }`}
            >
              {fulfilmentTabLabel(t)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 space-y-2" data-testid="fulfil-order-list">
            {!listLoaded || (pending && rows.length === 0 && busyLabel === "Loading orders…") ? (
              <p className="text-sm text-charcoal/60 card-surface p-6 text-center inline-flex w-full items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading orders…
              </p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-charcoal/60 card-surface p-6 text-center">
                No orders in {fulfilmentTabLabel(tab)}.{" "}
                {tab === "stock-check"
                  ? "Pull open orders to load Unfulfilled / Partially fulfilled from Shopify."
                  : "Switch tabs, or pull open orders."}
              </p>
            ) : (
              rows.map((row) => {
                const selected = selectedId === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    data-testid={`fulfil-row-${row.orderNumber}`}
                    aria-pressed={selected}
                    onClick={() => openDetail(row.id)}
                    className={`w-full text-left card-surface px-4 py-3 border transition-colors ${
                      selected
                        ? "border-deep-navy bg-deep-navy/[0.06] shadow-[inset_3px_0_0_0_var(--deep-navy)]"
                        : "border-transparent hover:border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-deep-navy flex items-center gap-2">
                          #{row.orderNumber}
                          {selected ? (
                            <span className="text-[10px] uppercase tracking-wide text-deep-navy/80 font-semibold">
                              Selected
                            </span>
                          ) : null}
                        </p>
                        <p className="text-sm text-charcoal/70">{row.customerName ?? "—"}</p>
                      </div>
                      <StatusChip label={fulfilmentStatusLabel(row.status)} tone="neutral" />
                    </div>
                    <p className="text-xs text-charcoal/55 mt-1">
                      {new Date(row.orderDate).toLocaleString()} · ₹{row.totalAmount.toFixed(0)}
                      {row.openTaskCount > 0 ? ` · ${row.openTaskCount} open task(s)` : ""}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          <div className="lg:col-span-3">
            {!selectedId ? (
              <p className="text-sm text-charcoal/60 card-surface p-8 text-center">
                Select an order on the left to start stock check.
              </p>
            ) : detailLoading || !detail ? (
              <div
                className="card-surface p-8 text-center space-y-2"
                data-testid="fulfil-detail-loading"
              >
                <p className="inline-flex items-center justify-center gap-2 text-sm text-deep-navy w-full">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening #{selectedRow?.orderNumber ?? "order"}…
                </p>
                <p className="text-xs text-charcoal/55">
                  {selectedRow?.customerName ?? "Loading fulfilment detail"}
                </p>
              </div>
            ) : (
              <div className="space-y-4" data-testid="fulfil-detail">
                {pending && busyLabel ? (
                  <div className="flex items-center gap-2 rounded-lg border border-deep-navy/20 bg-deep-navy/[0.04] px-3 py-2 text-sm text-deep-navy">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>{busyLabel}</span>
                  </div>
                ) : null}
                <FormSection
                  title={`Order #${detail.orderNumber}`}
                  description={`${detail.customerName ?? "Customer"} · ${fulfilmentStatusLabel(detail.status)} · Shopify ${detail.financialStatus ?? "—"} / ${detail.shopifyFulfilmentStatus ?? "—"}`}
                >
                  <p className="text-sm text-charcoal/70">
                    {detail.contactPhone ?? "No phone"} · {detail.shippingCity ?? "—"}{" "}
                    {detail.shippingZip ?? ""}
                  </p>
                </FormSection>

                <FormSection
                  title="Stock check"
                  description="System qty is ledger projection — not physical truth. Found / Not found does not mutate inventory."
                >
                  <ul className="space-y-3">
                    {detail.lines.map((line) => (
                      <li key={line.id} className="border border-border rounded-lg px-3 py-3">
                        <p className="font-medium text-deep-navy">
                          {line.title}
                          {line.variantTitle ? ` — ${line.variantTitle}` : ""} × {line.requiredQuantity}
                        </p>
                        <p className="text-xs text-charcoal/55 mt-0.5">
                          System at Studio:{" "}
                          {line.systemStudioQty == null ? "unlinked / unknown" : line.systemStudioQty}
                          {line.resolution ? ` · Resolution: ${line.resolution}` : ""}
                          {line.physicalStatus !== "unchecked"
                            ? ` · Physical: ${line.physicalStatus}`
                            : " · Physical: not checked yet"}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <button
                            type="button"
                            disabled={pending}
                            className={`text-xs px-3 py-1.5 rounded-full border disabled:opacity-50 ${
                              line.physicalStatus === "found"
                                ? "border-deep-navy bg-deep-navy text-white"
                                : "border-border"
                            }`}
                            onClick={() => {
                              runAction(`Marking line found…`, async () => {
                                const res = await setLinePhysicalCheckAction({
                                  fulfilmentOrderId: detail.id,
                                  lineId: line.id,
                                  physicalStatus: "found",
                                });
                                await applyDetailResult(res);
                              });
                            }}
                          >
                            {line.physicalStatus === "found" ? "✓ Found physically" : "Found physically"}
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className={`text-xs px-3 py-1.5 rounded-full border disabled:opacity-50 ${
                              line.physicalStatus === "not-found"
                                ? "border-aarla-red bg-aarla-red/10 text-aarla-red"
                                : "border-border"
                            }`}
                            onClick={() => {
                              runAction(`Marking line not found…`, async () => {
                                const res = await setLinePhysicalCheckAction({
                                  fulfilmentOrderId: detail.id,
                                  lineId: line.id,
                                  physicalStatus: "not-found",
                                });
                                await applyDetailResult(res);
                              });
                            }}
                          >
                            {line.physicalStatus === "not-found" ? "✓ Not found" : "Not found"}
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className="text-xs px-3 py-1.5 rounded-full border border-border disabled:opacity-50"
                            onClick={() => {
                              runAction("Escalating to Vani…", async () => {
                                const res = await escalateFounderAvailabilityAction({
                                  fulfilmentOrderId: detail.id,
                                  lineId: line.id,
                                  note: "No studio or partner stock confirmed",
                                });
                                await applyDetailResult(res);
                              });
                            }}
                          >
                            Ask Vani
                          </button>
                        </div>
                        {line.partnerStock.length > 0 ? (
                          <div className="mt-2 text-xs text-charcoal/70 space-y-1">
                            <p className="font-medium">Partner inventory (not ready until received)</p>
                            {line.partnerStock.map((p) => (
                              <div key={`${p.partnerCode}-${p.locationCode}`} className="flex items-center gap-2">
                                <span>
                                  {p.partnerName} — {p.qty}
                                </span>
                                <button
                                  type="button"
                                  disabled={pending}
                                  className="underline disabled:opacity-50"
                                  onClick={() => {
                                    runAction(`Arranging stock from ${p.partnerName}…`, async () => {
                                      const res = await requestPartnerRecallAction({
                                        fulfilmentOrderId: detail.id,
                                        lineId: line.id,
                                        partnerCode: p.partnerCode,
                                        partnerLocationCode: p.locationCode,
                                        quantity: Math.min(line.requiredQuantity, p.qty),
                                      });
                                      await applyDetailResult(res);
                                    });
                                  }}
                                >
                                  Arrange from partner
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </FormSection>

                {detail.tasks.length > 0 ? (
                  <FormSection title="Open follow-ups" description="Partner recalls, founder and customer decisions.">
                    <ul className="space-y-3 text-sm">
                      {detail.tasks.map((task) => (
                        <li key={task.id} className="border border-border rounded-lg px-3 py-2">
                          <p className="font-medium text-deep-navy">
                            {task.title} · {task.status}
                          </p>
                          <p className="text-xs text-charcoal/60">{task.description}</p>
                          {task.taskType === "partner-stock-recall" && task.status !== "received" ? (
                            <button
                              type="button"
                              disabled={pending}
                              className="mt-2 text-xs underline disabled:opacity-50"
                              onClick={() => {
                                const line = detail.lines.find((l) => l.id === task.fulfilmentLineId);
                                if (!line?.catalogProductCode) {
                                  setError("Link catalog product on the line before receiving recall.");
                                  return;
                                }
                                runAction("Recording partner stock received…", async () => {
                                  const res = await receivePartnerRecallAction({
                                    fulfilmentOrderId: detail.id,
                                    taskId: task.id,
                                    productId: line.catalogProductCode!,
                                    variantId: line.catalogVariantCode ?? undefined,
                                  });
                                  await applyDetailResult(res);
                                });
                              }}
                            >
                              Mark received at Studio (ledger transfer)
                            </button>
                          ) : null}
                          {task.taskType === "founder-availability-decision" && task.status !== "completed" ? (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {(["can-arrange", "cannot-arrange", "alternative-possible"] as const).map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  disabled={pending}
                                  className="text-xs px-2 py-1 border border-border rounded-full disabled:opacity-50"
                                  onClick={() => {
                                    runAction(`Saving founder decision (${d})…`, async () => {
                                      const res = await recordFounderDecisionAction({
                                        fulfilmentOrderId: detail.id,
                                        taskId: task.id,
                                        decision: d,
                                        expectedAvailabilityAt:
                                          d === "can-arrange"
                                            ? new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
                                            : null,
                                      });
                                      await applyDetailResult(res);
                                    });
                                  }}
                                >
                                  {d}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {task.taskType === "customer-contact" && task.status !== "completed" ? (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {(
                                [
                                  "will-wait",
                                  "chose-alternative",
                                  "refund-cancel",
                                  "follow-up-later",
                                ] as const
                              ).map((o) => (
                                <button
                                  key={o}
                                  type="button"
                                  disabled={pending}
                                  className="text-xs px-2 py-1 border border-border rounded-full disabled:opacity-50"
                                  onClick={() => {
                                    runAction(`Saving customer outcome (${o})…`, async () => {
                                      const res = await recordCustomerOutcomeAction({
                                        fulfilmentOrderId: detail.id,
                                        taskId: task.id,
                                        outcome: o,
                                      });
                                      await applyDetailResult(res);
                                    });
                                  }}
                                >
                                  {o}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </FormSection>
                ) : null}

                {(detail.status === "ready-to-pick" ||
                  detail.status === "ready-to-pack" ||
                  detail.pickedAt) && (
                  <FormSection
                    title="Picking"
                    description={
                      detail.pickedAt || detail.status === "ready-to-pack"
                        ? "Physical pick confirmed."
                        : "Confirm physical pick checklist."
                    }
                  >
                    <ul className="text-sm space-y-1 mb-3">
                      {detail.lines.map((l) => (
                        <li key={l.id}>
                          [{l.picked || detail.pickedAt ? "x" : " "}] {l.title}
                          {l.variantTitle ? ` — ${l.variantTitle}` : ""} × {l.requiredQuantity}
                        </li>
                      ))}
                    </ul>
                    {detail.pickedAt || detail.status === "ready-to-pack" || detail.status === "ready-to-ship" ? (
                      <p
                        className="inline-flex items-center gap-2 text-sm text-deep-navy"
                        data-testid="fulfil-picked-done"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        All items picked — continue with packing below.
                      </p>
                    ) : (
                      <button
                        type="button"
                        data-testid="fulfil-confirm-picked"
                        disabled={pending}
                        className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white disabled:opacity-60"
                        onClick={() => {
                          runAction("Confirming all items picked…", async () => {
                            const res = await confirmPickingAction({
                              fulfilmentOrderId: detail.id,
                            });
                            await applyDetailResult(
                              res,
                              "All items picked — packing is next.",
                            );
                          });
                        }}
                      >
                        {pending && busyLabel?.includes("picked") ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Package className="h-4 w-4" />
                        )}
                        Confirm all items picked
                      </button>
                    )}
                  </FormSection>
                )}

                {(detail.status === "ready-to-pack" ||
                  detail.status === "ready-to-ship" ||
                  Boolean(detail.pickedAt)) && (
                  <FormSection
                    title="Packing & freebie"
                    description="Use the suggestion, or say what you changed — we’ll suggest that next time for similar orders."
                  >
                    {packHint ? (
                      <>
                        <p className="text-sm font-medium text-deep-navy">{packHint.packing.cover}</p>
                        <ul className="text-sm text-charcoal/70 list-disc pl-5 mt-1">
                          {packHint.packing.materials.map((m) => (
                            <li key={m.label}>{m.label}</li>
                          ))}
                        </ul>
                        {packHint.packing.learnedFromNote ? (
                          <p className="text-xs text-deep-navy/80 mt-2">
                            Learned from earlier change: {packHint.packing.learnedFromNote}
                          </p>
                        ) : null}
                        <p className="text-sm mt-2">
                          Freebie:{" "}
                          {packHint.freebie
                            ? packHint.freebie.label
                            : "None configured / in stock"}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-charcoal/60 inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading packing suggestion…
                      </p>
                    )}
                    {!showPackChange ? (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          type="button"
                          disabled={pending || !packHint}
                          className="text-sm rounded-full px-4 py-2 border border-border disabled:opacity-50"
                          onClick={() => {
                            runAction("Saving packing suggestion…", async () => {
                              const res = await decidePackingAction({
                                fulfilmentOrderId: detail.id,
                                useSuggestion: true,
                                freebieChoice: packHint?.freebie ? "add" : "none",
                                freebieProductCode: null,
                              });
                              setShowPackChange(false);
                              await applyDetailResult(
                                res,
                                "Packing saved — choose shipping next.",
                              );
                            });
                          }}
                        >
                          Use suggestion
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="text-sm rounded-full px-4 py-2 border border-border disabled:opacity-50"
                          onClick={() => {
                            setShowPackChange(true);
                            setPackReason("");
                            if (packHint) {
                              const labels = packHint.packing.materials
                                .map((m) => m.label)
                                .filter(Boolean);
                              setPackItems(
                                labels.length > 0 ? labels : [packHint.packing.cover, ""],
                              );
                            } else {
                              setPackItems([""]);
                            }
                          }}
                        >
                          Change packing…
                        </button>
                      </div>
                    ) : (
                      <div
                        className="mt-3 space-y-3 rounded-lg border border-border p-3"
                        data-testid="fulfil-pack-change-form"
                      >
                        <p className="text-sm font-medium text-deep-navy">
                          What are you packing instead?
                        </p>
                        <p className="text-xs text-charcoal/60">
                          Free-form line items — ecommerce cover, Aarla white bag, both, inserts,
                          whatever you used. Recorded as-is for next time.
                        </p>
                        <div className="space-y-2">
                          {packItems.map((item, idx) => (
                            <div key={`pack-item-${idx}`} className="flex gap-2 items-center">
                              <input
                                className="flex-1 text-sm border border-border rounded-md px-3 py-2"
                                value={item}
                                disabled={pending}
                                placeholder="e.g. Aarla white bag"
                                onChange={(e) => {
                                  const next = [...packItems];
                                  next[idx] = e.target.value;
                                  setPackItems(next);
                                }}
                              />
                              <button
                                type="button"
                                disabled={pending || packItems.length <= 1}
                                className="p-2 text-charcoal/50 hover:text-aarla-red disabled:opacity-30"
                                aria-label="Remove line"
                                onClick={() => {
                                  setPackItems((prev) => prev.filter((_, i) => i !== idx));
                                }}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            disabled={pending}
                            className="inline-flex items-center gap-1 text-xs text-deep-navy underline disabled:opacity-50"
                            onClick={() => setPackItems((prev) => [...prev, ""])}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add line item
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {PACKING_QUICK_ADD_ITEMS.map((label) => (
                            <button
                              key={label}
                              type="button"
                              disabled={pending}
                              className="text-[11px] px-2 py-1 rounded-full border border-border text-charcoal/70 hover:border-deep-navy/40 disabled:opacity-50"
                              onClick={() => {
                                setPackItems((prev) => {
                                  const cleaned = prev.map((s) => s.trim()).filter(Boolean);
                                  if (cleaned.some((s) => s.toLowerCase() === label.toLowerCase())) {
                                    return cleaned.length > 0 ? cleaned : [""];
                                  }
                                  return [...cleaned, label];
                                });
                              }}
                            >
                              + {label}
                            </button>
                          ))}
                        </div>
                        <label className="block text-xs text-charcoal/70">
                          What changed / why? (saved for next similar order)
                          <textarea
                            className="mt-1 w-full text-sm border border-border rounded-md px-3 py-2 min-h-[72px]"
                            value={packReason}
                            disabled={pending}
                            placeholder="e.g. Store pickup — Aarla white bag only; no ecommerce cover"
                            onChange={(e) => setPackReason(e.target.value)}
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={
                              pending ||
                              packReason.trim().length < 3 ||
                              packItems.every((s) => !s.trim())
                            }
                            className="text-sm rounded-full px-4 py-2 bg-deep-navy text-white disabled:opacity-50"
                            onClick={() => {
                              const reason = packReason.trim();
                              const items = packItems.map((s) => s.trim()).filter(Boolean);
                              if (items.length === 0) {
                                setError("Add at least one packing line item.");
                                return;
                              }
                              if (reason.length < 3) {
                                setError("Say what you changed so we can suggest it next time.");
                                return;
                              }
                              const signature =
                                packHint?.packing.signature ??
                                packingLineSignature(
                                  detail.lines.map((l) => ({
                                    title: l.title,
                                    quantity: l.requiredQuantity,
                                  })),
                                );
                              const actual = buildPackingActual({
                                items,
                                signature,
                                reason,
                              });
                              runAction("Saving packing change…", async () => {
                                const res = await decidePackingAction({
                                  fulfilmentOrderId: detail.id,
                                  useSuggestion: false,
                                  actual,
                                  overrideNote: reason,
                                  freebieChoice: "none",
                                });
                                setShowPackChange(false);
                                setPackReason("");
                                await applyDetailResult(
                                  res,
                                  "Packing change saved — we’ll suggest these line items next time.",
                                );
                              });
                            }}
                          >
                            Save packing change
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className="text-sm rounded-full px-4 py-2 border border-border disabled:opacity-50"
                            onClick={() => {
                              setShowPackChange(false);
                              setPackReason("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </FormSection>
                )}

                <FormSection
                  title="Shipping"
                  description="Delhivery create/label APIs are not in this codebase yet — record method and AWB manually. Tracking stays on Shipments."
                >
                  <div className="flex flex-wrap gap-2 mb-3">
                    <select
                      className="text-sm border border-border rounded-md px-3 py-2 disabled:opacity-50"
                      value={shipMethod}
                      disabled={pending}
                      onChange={(e) => setShipMethod(e.target.value as FulfilmentShippingMethod)}
                    >
                      {FULFILMENT_SHIPPING_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={pending}
                      className="text-sm rounded-full px-4 py-2 bg-deep-navy text-white disabled:opacity-60"
                      onClick={() => {
                        runAction("Saving shipping method…", async () => {
                          const res = await decideShippingAction({
                            fulfilmentOrderId: detail.id,
                            method: shipMethod,
                          });
                          await applyDetailResult(res);
                        });
                      }}
                    >
                      Save shipping method
                    </button>
                  </div>

                  {detail.shippingMethod === "store-pickup" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        className="text-sm border border-border rounded-full px-3 py-1.5 disabled:opacity-50"
                        onClick={() => {
                          runAction("Marking customer informed…", async () => {
                            const res = await markStorePickupProgressAction({
                              fulfilmentOrderId: detail.id,
                              step: "informed",
                            });
                            await applyDetailResult(res);
                          });
                        }}
                      >
                        Customer informed
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="text-sm border border-border rounded-full px-3 py-1.5 disabled:opacity-50"
                        onClick={() => {
                          runAction("Marking picked up…", async () => {
                            const res = await markStorePickupProgressAction({
                              fulfilmentOrderId: detail.id,
                              step: "picked-up",
                            });
                            await applyDetailResult(res);
                          });
                        }}
                      >
                        Picked up
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        className="text-sm border border-border rounded-md px-3 py-2 disabled:opacity-50"
                        placeholder="AWB / reference"
                        value={awbDraft}
                        disabled={pending}
                        onChange={(e) => setAwbDraft(e.target.value)}
                      />
                      <input
                        className="text-sm border border-border rounded-md px-3 py-2 disabled:opacity-50"
                        placeholder="Courier / Porter"
                        value={courierDraft}
                        disabled={pending}
                        onChange={(e) => setCourierDraft(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={pending}
                        className="text-sm rounded-full px-4 py-2 border border-border disabled:opacity-50"
                        onClick={() => {
                          runAction("Saving courier details…", async () => {
                            const res = await saveManualCourierAction({
                              fulfilmentOrderId: detail.id,
                              awb: awbDraft || null,
                              courierProvider: courierDraft || null,
                              labelStatus: awbDraft ? "ready" : "none",
                              alternateAwaitingAwbCost:
                                shipMethod === "alternate-courier" && !awbDraft,
                            });
                            await applyDetailResult(res);
                          });
                        }}
                      >
                        Save courier details
                      </button>
                      <button
                        type="button"
                        data-testid="fulfil-confirm-handover"
                        disabled={pending}
                        className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white disabled:opacity-60"
                        onClick={() => {
                          runAction("Confirming handover…", async () => {
                            const res = await confirmHandoverAction({
                              fulfilmentOrderId: detail.id,
                            });
                            await applyDetailResult(res, "Handed over — marked dispatched.");
                          });
                        }}
                      >
                        {pending && busyLabel?.includes("handover") ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Truck className="h-4 w-4" />
                        )}
                        Confirm handover
                      </button>
                    </div>
                  )}
                </FormSection>

                <FormSection title="Activity" description="Operational timeline for this order.">
                  <ul className="space-y-2 text-sm">
                    {detail.events.map((e) => (
                      <li key={e.id} className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-charcoal/40 shrink-0" />
                        <span>
                          <span className="text-charcoal/50">
                            {new Date(e.createdAt).toLocaleString()} —{" "}
                          </span>
                          {e.summary}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={pending}
                    className="mt-3 text-xs underline text-charcoal/60 disabled:opacity-50"
                    onClick={() => {
                      if (!selectedId) return;
                      runAction("Refreshing order…", async () => {
                        setDetailLoading(true);
                        const [d, p] = await Promise.all([
                          getFulfilmentDetailAction(selectedId),
                          getPackingSuggestionsAction(selectedId),
                        ]);
                        setDetailLoading(false);
                        if (!d.ok) {
                          setError(d.error);
                          return;
                        }
                        setDetail(d.data);
                        if (p.ok) {
                          setPackHint({
                            packing: p.data.packing,
                            freebie: p.data.freebie
                              ? {
                                  label: p.data.freebie.label,
                                  estimatedCost: p.data.freebie.estimatedCost,
                                }
                              : null,
                          });
                          setPackItems(
                            p.data.packing.materials.map((m) => m.label).filter(Boolean).length > 0
                              ? p.data.packing.materials.map((m) => m.label)
                              : [p.data.packing.cover],
                          );
                        }
                        const list = await listFulfilmentWorkbenchAction(tab);
                        if (list.ok) {
                          setRows(list.data.rows);
                          setPastCutoff(list.data.pastCutoff);
                          setCutoffLabel(list.data.cutoffLabel);
                        }
                      });
                    }}
                  >
                    Refresh detail
                  </button>
                </FormSection>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

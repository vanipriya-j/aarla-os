"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
import { CheckCircle2, Loader2, Package, RefreshCw, Truck } from "lucide-react";

export default function FulfilOrdersPage() {
  const [tab, setTab] = useState<FulfilmentTab>("stock-check");
  const [rows, setRows] = useState<FulfilmentOrderListItem[]>([]);
  const [pastCutoff, setPastCutoff] = useState(false);
  const [cutoffLabel, setCutoffLabel] = useState("12:30 PM Asia/Kolkata");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FulfilmentOrderDetail | null>(null);
  const [packHint, setPackHint] = useState<{
    packing: { cover: string; materials: Array<{ label: string }>; notes: string[] };
    freebie: { label: string; estimatedCost: number | null } | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [awbDraft, setAwbDraft] = useState("");
  const [courierDraft, setCourierDraft] = useState("");
  const [shipMethod, setShipMethod] = useState<FulfilmentShippingMethod>("delhivery-surface");

  const reloadList = useCallback((nextTab = tab) => {
    startTransition(async () => {
      const res = await listFulfilmentWorkbenchAction(nextTab);
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
    startTransition(async () => {
      const [d, p] = await Promise.all([
        getFulfilmentDetailAction(id),
        getPackingSuggestionsAction(id),
      ]);
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
      }
      if (d.data?.shippingMethod) setShipMethod(d.data.shippingMethod);
      setAwbDraft(d.data?.awb ?? "");
      setCourierDraft(d.data?.courierProvider ?? "");
    });
  }, []);

  useEffect(() => {
    reloadList(tab);
  }, [tab, reloadList]);

  async function refreshDetail() {
    if (!selectedId) return;
    openDetail(selectedId);
    reloadList(tab);
  }

  return (
    <>
      <Header
        title="Fulfil Orders"
        subtitle="Stock check → pick → pack → ship → today's handover. Uses synced Shopify orders and the inventory ledger — not demo dispatch."
      />

      <div className="px-6 py-6 space-y-5" data-testid="fulfil-orders-page">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="fulfil-sync-incoming"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const res = await syncIncomingFulfilmentOrdersAction();
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setStatus(`Pulled ${res.data.created} order(s) into fulfilment.`);
                reloadList(tab);
              });
            }}
            className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white hover:bg-deep-navy/90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Pull new Shopify orders
          </button>
          <StatusChip
            label={pastCutoff ? `Past cut-off (${cutoffLabel})` : `Before cut-off (${cutoffLabel})`}
            tone={pastCutoff ? "warning" : "info"}
          />
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
          <div className="lg:col-span-2 space-y-2">
            {rows.length === 0 ? (
              <p className="text-sm text-charcoal/60 card-surface p-6 text-center">
                No orders in this view. Pull new Shopify orders, or switch tabs.
              </p>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  data-testid={`fulfil-row-${row.orderNumber}`}
                  onClick={() => openDetail(row.id)}
                  className={`w-full text-left card-surface px-4 py-3 border ${
                    selectedId === row.id ? "border-deep-navy" : "border-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-deep-navy">#{row.orderNumber}</p>
                      <p className="text-sm text-charcoal/70">{row.customerName ?? "—"}</p>
                    </div>
                    <StatusChip label={fulfilmentStatusLabel(row.status)} tone="neutral" />
                  </div>
                  <p className="text-xs text-charcoal/55 mt-1">
                    {new Date(row.orderDate).toLocaleString()} · ₹{row.totalAmount.toFixed(0)}
                    {row.openTaskCount > 0 ? ` · ${row.openTaskCount} open task(s)` : ""}
                  </p>
                </button>
              ))
            )}
          </div>

          <div className="lg:col-span-3">
            {!detail ? (
              <p className="text-sm text-charcoal/60 card-surface p-8 text-center">
                Select an order to work the fulfilment flow.
              </p>
            ) : (
              <div className="space-y-4" data-testid="fulfil-detail">
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
                            : ""}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <button
                            type="button"
                            className="text-xs px-3 py-1.5 rounded-full border border-border"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await setLinePhysicalCheckAction({
                                  fulfilmentOrderId: detail.id,
                                  lineId: line.id,
                                  physicalStatus: "found",
                                });
                                if (res.ok) setDetail(res.data);
                                else setError(res.error);
                                reloadList(tab);
                              });
                            }}
                          >
                            Found physically
                          </button>
                          <button
                            type="button"
                            className="text-xs px-3 py-1.5 rounded-full border border-border"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await setLinePhysicalCheckAction({
                                  fulfilmentOrderId: detail.id,
                                  lineId: line.id,
                                  physicalStatus: "not-found",
                                });
                                if (res.ok) setDetail(res.data);
                                else setError(res.error);
                                reloadList(tab);
                              });
                            }}
                          >
                            Not found
                          </button>
                          <button
                            type="button"
                            className="text-xs px-3 py-1.5 rounded-full border border-border"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await escalateFounderAvailabilityAction({
                                  fulfilmentOrderId: detail.id,
                                  lineId: line.id,
                                  note: "No studio or partner stock confirmed",
                                });
                                if (res.ok) setDetail(res.data);
                                else setError(res.error);
                                reloadList(tab);
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
                                  className="underline"
                                  onClick={() => {
                                    startTransition(async () => {
                                      const res = await requestPartnerRecallAction({
                                        fulfilmentOrderId: detail.id,
                                        lineId: line.id,
                                        partnerCode: p.partnerCode,
                                        partnerLocationCode: p.locationCode,
                                        quantity: Math.min(line.requiredQuantity, p.qty),
                                      });
                                      if (res.ok) setDetail(res.data);
                                      else setError(res.error);
                                      reloadList(tab);
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
                              className="mt-2 text-xs underline"
                              onClick={() => {
                                const line = detail.lines.find((l) => l.id === task.fulfilmentLineId);
                                if (!line?.catalogProductCode) {
                                  setError("Link catalog product on the line before receiving recall.");
                                  return;
                                }
                                startTransition(async () => {
                                  const res = await receivePartnerRecallAction({
                                    fulfilmentOrderId: detail.id,
                                    taskId: task.id,
                                    productId: line.catalogProductCode!,
                                    variantId: line.catalogVariantCode ?? undefined,
                                  });
                                  if (res.ok) setDetail(res.data);
                                  else setError(res.error);
                                  reloadList(tab);
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
                                  className="text-xs px-2 py-1 border border-border rounded-full"
                                  onClick={() => {
                                    startTransition(async () => {
                                      const res = await recordFounderDecisionAction({
                                        fulfilmentOrderId: detail.id,
                                        taskId: task.id,
                                        decision: d,
                                        expectedAvailabilityAt:
                                          d === "can-arrange"
                                            ? new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
                                            : null,
                                      });
                                      if (res.ok) setDetail(res.data);
                                      else setError(res.error);
                                      reloadList(tab);
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
                                  className="text-xs px-2 py-1 border border-border rounded-full"
                                  onClick={() => {
                                    startTransition(async () => {
                                      const res = await recordCustomerOutcomeAction({
                                        fulfilmentOrderId: detail.id,
                                        taskId: task.id,
                                        outcome: o,
                                      });
                                      if (res.ok) setDetail(res.data);
                                      else setError(res.error);
                                      reloadList(tab);
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

                {(detail.status === "ready-to-pick" || detail.status === "ready-to-pack") && (
                  <FormSection title="Picking" description="Confirm physical pick checklist.">
                    <ul className="text-sm space-y-1 mb-3">
                      {detail.lines.map((l) => (
                        <li key={l.id}>
                          [{l.picked ? "x" : " "}] {l.title}
                          {l.variantTitle ? ` — ${l.variantTitle}` : ""} × {l.requiredQuantity}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      data-testid="fulfil-confirm-picked"
                      className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white"
                      onClick={() => {
                        startTransition(async () => {
                          const res = await confirmPickingAction({ fulfilmentOrderId: detail.id });
                          if (res.ok) setDetail(res.data);
                          else setError(res.error);
                          reloadList(tab);
                        });
                      }}
                    >
                      <Package className="h-4 w-4" /> Confirm all items picked
                    </button>
                  </FormSection>
                )}

                {(detail.status === "ready-to-pack" || detail.pickedAt) && packHint ? (
                  <FormSection title="Packing & freebie" description="Deterministic suggestion — overrides are stored.">
                    <p className="text-sm font-medium text-deep-navy">{packHint.packing.cover}</p>
                    <ul className="text-sm text-charcoal/70 list-disc pl-5 mt-1">
                      {packHint.packing.materials.map((m) => (
                        <li key={m.label}>{m.label}</li>
                      ))}
                    </ul>
                    <p className="text-sm mt-2">
                      Freebie: {packHint.freebie ? packHint.freebie.label : "None configured / in stock"}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        type="button"
                        className="text-sm rounded-full px-4 py-2 border border-border"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await decidePackingAction({
                              fulfilmentOrderId: detail.id,
                              useSuggestion: true,
                              freebieChoice: packHint.freebie ? "add" : "none",
                              freebieProductCode: null,
                            });
                            if (res.ok) setDetail(res.data);
                            else setError(res.error);
                            reloadList(tab);
                          });
                        }}
                      >
                        Use suggestion
                      </button>
                      <button
                        type="button"
                        className="text-sm rounded-full px-4 py-2 border border-border"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await decidePackingAction({
                              fulfilmentOrderId: detail.id,
                              useSuggestion: false,
                              overrideNote: "Operator changed packing",
                              freebieChoice: "none",
                            });
                            if (res.ok) setDetail(res.data);
                            else setError(res.error);
                            reloadList(tab);
                          });
                        }}
                      >
                        Change packing · no freebie
                      </button>
                    </div>
                  </FormSection>
                ) : null}

                <FormSection
                  title="Shipping"
                  description="Delhivery create/label APIs are not in this codebase yet — record method and AWB manually. Tracking stays on Shipments."
                >
                  <div className="flex flex-wrap gap-2 mb-3">
                    <select
                      className="text-sm border border-border rounded-md px-3 py-2"
                      value={shipMethod}
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
                      className="text-sm rounded-full px-4 py-2 bg-deep-navy text-white"
                      onClick={() => {
                        startTransition(async () => {
                          const res = await decideShippingAction({
                            fulfilmentOrderId: detail.id,
                            method: shipMethod,
                          });
                          if (res.ok) setDetail(res.data);
                          else setError(res.error);
                          reloadList(tab);
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
                        className="text-sm border border-border rounded-full px-3 py-1.5"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await markStorePickupProgressAction({
                              fulfilmentOrderId: detail.id,
                              step: "informed",
                            });
                            if (res.ok) setDetail(res.data);
                            reloadList(tab);
                          });
                        }}
                      >
                        Customer informed
                      </button>
                      <button
                        type="button"
                        className="text-sm border border-border rounded-full px-3 py-1.5"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await markStorePickupProgressAction({
                              fulfilmentOrderId: detail.id,
                              step: "picked-up",
                            });
                            if (res.ok) setDetail(res.data);
                            reloadList(tab);
                          });
                        }}
                      >
                        Picked up
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        className="text-sm border border-border rounded-md px-3 py-2"
                        placeholder="AWB / reference"
                        value={awbDraft}
                        onChange={(e) => setAwbDraft(e.target.value)}
                      />
                      <input
                        className="text-sm border border-border rounded-md px-3 py-2"
                        placeholder="Courier / Porter"
                        value={courierDraft}
                        onChange={(e) => setCourierDraft(e.target.value)}
                      />
                      <button
                        type="button"
                        className="text-sm rounded-full px-4 py-2 border border-border"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await saveManualCourierAction({
                              fulfilmentOrderId: detail.id,
                              awb: awbDraft || null,
                              courierProvider: courierDraft || null,
                              labelStatus: awbDraft ? "ready" : "none",
                              alternateAwaitingAwbCost:
                                shipMethod === "alternate-courier" && !awbDraft,
                            });
                            if (res.ok) setDetail(res.data);
                            else setError(res.error);
                            reloadList(tab);
                          });
                        }}
                      >
                        Save courier details
                      </button>
                      <button
                        type="button"
                        data-testid="fulfil-confirm-handover"
                        className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await confirmHandoverAction({
                              fulfilmentOrderId: detail.id,
                            });
                            if (res.ok) {
                              setDetail(res.data);
                              setStatus("Handed over — marked dispatched.");
                            } else setError(res.error);
                            reloadList(tab);
                          });
                        }}
                      >
                        <Truck className="h-4 w-4" /> Confirm handover
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
                    className="mt-3 text-xs underline text-charcoal/60"
                    onClick={() => void refreshDetail()}
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

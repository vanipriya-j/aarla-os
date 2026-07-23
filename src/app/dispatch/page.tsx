"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { FormSection } from "@/components/ui/FormSection";
import { StepWorkflow } from "@/components/ui/StepWorkflow";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { packagingChecklistDefaults, shopifyOrders } from "@/lib/mock-data";
import type { ShopifyOrder } from "@/lib/types";
import { CheckCircle2, Printer, Truck } from "lucide-react";

const steps = [
  { id: "select", label: "Select order" },
  { id: "confirm", label: "Confirm products" },
  { id: "pack", label: "Packaging" },
  { id: "ship", label: "Shipment" },
  { id: "label", label: "Label" },
  { id: "done", label: "Dispatch" },
];

export default function DispatchPage() {
  // Fixture list only — not the commerce SoR. Canonical orders will be SalesOrders via adapters.
  const [orders, setOrders] = useState(shopifyOrders);
  const [selected, setSelected] = useState<ShopifyOrder | null>(null);
  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(packagingChecklistDefaults.map((c) => [c, false])),
  );
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [pickup, setPickup] = useState(false);
  const [labelReady, setLabelReady] = useState(false);
  const [labelPrinted, setLabelPrinted] = useState(false);
  const [packed, setPacked] = useState(false);
  const [dispatched, setDispatched] = useState(false);

  const allChecked = packagingChecklistDefaults.every((c) => checks[c]);

  const start = (order: ShopifyOrder) => {
    setSelected(order);
    setStep(1);
    setChecks(Object.fromEntries(packagingChecklistDefaults.map((c) => [c, false])));
    setShipmentId(null);
    setPickup(false);
    setLabelReady(false);
    setLabelPrinted(false);
    setPacked(false);
    setDispatched(false);
  };

  const finishDispatch = () => {
    if (!selected) return;
    setDispatched(true);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selected.id ? { ...o, courierStatus: "In Transit" as const } : o,
      ),
    );
  };

  return (
    <>
      <Header
        title="Dispatch Orders"
        subtitle="Pack and dispatch channel orders. Demo list is a fixture — Aarla OS SalesOrders are the future source of truth."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {!selected ? (
          <DataTable
            rows={orders}
            rowKey={(r) => r.id}
            onRowClick={start}
            columns={[
              {
                key: "id",
                header: "Order",
                render: (r) => <span className="font-medium text-deep-navy">{r.id}</span>,
              },
              {
                key: "customer",
                header: "Customer",
                render: (r) => r.customer,
              },
              {
                key: "products",
                header: "Products",
                render: (r) => (
                  <span className="text-charcoal/75">
                    {r.products.map((p) => `${p.name} ×${p.qty}`).join(", ")}
                  </span>
                ),
              },
              {
                key: "pay",
                header: "Payment",
                render: (r) => (
                  <StatusChip label={r.paymentStatus} tone={statusToneFromLabel(r.paymentStatus)} />
                ),
              },
              { key: "date", header: "Order date", render: (r) => r.orderDate },
              { key: "city", header: "City", render: (r) => r.deliveryCity },
              {
                key: "wt",
                header: "Weight",
                render: (r) => `${r.packageWeightKg} kg`,
              },
              {
                key: "courier",
                header: "Courier",
                render: (r) => (
                  <StatusChip label={r.courierStatus} tone={statusToneFromLabel(r.courierStatus)} />
                ),
              },
            ]}
          />
        ) : (
          <div className="space-y-4 animate-fade-up">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-charcoal/55">Dispatching</p>
                <h2 className="font-display text-2xl text-deep-navy">
                  {selected.id} · {selected.customer}
                </h2>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSelected(null);
                  setStep(0);
                }}
              >
                Back to orders
              </Button>
            </div>

            <div className="card-surface p-4">
              <StepWorkflow steps={steps} current={step} onStepClick={(i) => i <= step && setStep(i)} />
            </div>

            {step === 1 ? (
              <FormSection title="Confirm products">
                <ul className="space-y-2">
                  {selected.products.map((p) => (
                    <li
                      key={p.name}
                      className="flex justify-between rounded-xl border border-border px-4 py-3 text-sm"
                    >
                      <span className="text-deep-navy font-medium">{p.name}</span>
                      <span className="text-charcoal/60">Qty {p.qty}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-charcoal/55">
                  {selected.deliveryCity} · {selected.packageWeightKg} kg · {selected.paymentStatus}
                </p>
                <Button onClick={() => setStep(2)}>Products confirmed</Button>
              </FormSection>
            ) : null}

            {step === 2 ? (
              <FormSection title="Packaging checklist">
                <ul className="space-y-2">
                  {packagingChecklistDefaults.map((item) => (
                    <li key={item}>
                      <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm cursor-pointer hover:bg-pale-cream">
                        <input
                          type="checkbox"
                          checked={!!checks[item]}
                          onChange={(e) =>
                            setChecks((prev) => ({ ...prev, [item]: e.target.checked }))
                          }
                        />
                        {item}
                      </label>
                    </li>
                  ))}
                </ul>
                <Button disabled={!allChecked} onClick={() => setStep(3)}>
                  Continue to shipment
                </Button>
              </FormSection>
            ) : null}

            {step === 3 ? (
              <FormSection title="Generate shipment & schedule pickup">
                {!shipmentId ? (
                  <Button
                    onClick={() => setShipmentId(`SHP-${selected.id.slice(-4)}-${Date.now().toString().slice(-4)}`)}
                  >
                    <Truck className="h-4 w-4" />
                    Generate shipment
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm">
                      Shipment ID: <span className="font-medium text-deep-navy">{shipmentId}</span>
                    </p>
                    <Button variant="outline" disabled={pickup} onClick={() => setPickup(true)}>
                      {pickup ? "Pickup scheduled" : "Schedule pickup"}
                    </Button>
                    <div>
                      <Button disabled={!pickup} onClick={() => setStep(4)}>
                        Continue to label
                      </Button>
                    </div>
                  </div>
                )}
              </FormSection>
            ) : null}

            {step === 4 ? (
              <FormSection title="Shipping label">
                <div className="flex flex-wrap gap-2">
                  <Button disabled={labelReady} onClick={() => setLabelReady(true)}>
                    {labelReady ? "Label generated" : "Generate label"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!labelReady || labelPrinted}
                    onClick={() => setLabelPrinted(true)}
                  >
                    <Printer className="h-4 w-4" />
                    {labelPrinted ? "Label printed" : "Print label"}
                  </Button>
                </div>
                {labelReady ? (
                  <div className="rounded-xl border border-border bg-white p-5 font-mono text-xs space-y-1">
                    <p className="text-sm font-sans font-medium text-deep-navy">Aarla Shipping Label</p>
                    <p>{selected.customer}</p>
                    <p>{selected.deliveryCity}</p>
                    <p>{shipmentId}</p>
                    <p className="tracking-widest mt-2">||||| DEL-{selected.id} |||||</p>
                  </div>
                ) : null}
                <Button disabled={!labelPrinted} onClick={() => setStep(5)}>
                  Continue
                </Button>
              </FormSection>
            ) : null}

            {step === 5 ? (
              <FormSection title="Mark packed & dispatched">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={packed} onClick={() => setPacked(true)}>
                    {packed ? "Marked packed" : "Mark packed"}
                  </Button>
                  <Button disabled={!packed || dispatched} onClick={finishDispatch}>
                    {dispatched ? "Dispatched" : "Mark dispatched"}
                  </Button>
                </div>
                {dispatched ? (
                  <div className="rounded-xl bg-muted-green/25 border border-muted-green/40 p-5 flex gap-3">
                    <CheckCircle2 className="h-6 w-6 text-[#4a5c3a]" />
                    <div>
                      <p className="font-display text-xl text-deep-navy">Order on its way</p>
                      <p className="text-sm text-charcoal/70 mt-1">
                        {selected.id} marked In Transit. Courier pickup simulated.
                      </p>
                    </div>
                  </div>
                ) : null}
              </FormSection>
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}

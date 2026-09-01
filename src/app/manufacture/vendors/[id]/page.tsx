"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import {
  generateVendorWorkflowAction,
  getManufactureVendorAction,
  listVendorOrdersAction,
  saveVendorWorkflowAction,
  updateVendorHowTheyWorkAction,
  updateVendorProfileAction,
} from "@/app/actions/manufacture-actions";
import type {
  MfgVendorProfile,
  VendorOrder,
  VendorWorkflowAiDraft,
  WorkflowTemplate,
} from "@/lib/domain/manufacture-types";

export default function ManufactureVendorDetailPage() {
  const params = useParams<{ id: string }>();
  const code = decodeURIComponent(params.id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [vendor, setVendor] = useState<MfgVendorProfile | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowTemplate | null>(null);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [how, setHow] = useState("");
  const [draft, setDraft] = useState<VendorWorkflowAiDraft | null>(null);
  const [buffer, setBuffer] = useState(21);
  const [advance, setAdvance] = useState<number | null>(50);
  const [lead, setLead] = useState<number | null>(10);
  const [whatsapp, setWhatsapp] = useState("");
  const [contact, setContact] = useState("");
  const [terms, setTerms] = useState("");

  const load = () => {
    startTransition(async () => {
      setError(null);
      const [v, o] = await Promise.all([
        getManufactureVendorAction(code),
        listVendorOrdersAction(),
      ]);
      if (!v.ok) {
        setError(v.error);
        return;
      }
      setVendor(v.data.vendor);
      setActiveWorkflow(v.data.workflow);
      setHow(v.data.vendor.howTheyWork);
      setBuffer(v.data.vendor.internalBufferDays);
      setAdvance(v.data.vendor.advancePercentage);
      setLead(v.data.vendor.statedLeadTimeDays ?? v.data.vendor.leadTimeDays);
      setWhatsapp(v.data.vendor.whatsappNumber || v.data.vendor.phone);
      setContact(v.data.vendor.contactPerson);
      setTerms(v.data.vendor.paymentTerms);
      if (o.ok) setOrders(o.data.filter((x) => x.vendorId === code));
    });
  };

  useEffect(() => {
    load();
  }, [code]);

  function saveProfile() {
    startTransition(async () => {
      setSavedNote(null);
      const r = await updateVendorProfileAction(code, {
        contactPerson: contact,
        whatsappNumber: whatsapp,
        phone: whatsapp,
        paymentTerms: terms,
        advancePercentage: advance,
        statedLeadTimeDays: lead,
        internalBufferDays: buffer,
        howTheyWork: how,
      });
      if (!r.ok) setError(r.error);
      else {
        setVendor(r.data);
        setSavedNote("Profile saved.");
      }
    });
  }

  function saveHow() {
    startTransition(async () => {
      setSavedNote(null);
      const r = await updateVendorHowTheyWorkAction(code, how);
      if (!r.ok) setError(r.error);
      else {
        setVendor(r.data);
        setSavedNote("Description saved.");
      }
    });
  }

  function generate() {
    startTransition(async () => {
      setError(null);
      setSavedNote(null);
      const r = await generateVendorWorkflowAction({
        vendorCode: code,
        description: how,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft(r.data);
      setBuffer(r.data.internalBufferDays);
      setAdvance(r.data.advancePercentage);
      setLead(r.data.vendorLeadTimeDays);
    });
  }

  function approveWorkflow() {
    if (!draft) return;
    startTransition(async () => {
      setError(null);
      setSavedNote(null);
      const edited: VendorWorkflowAiDraft = {
        ...draft,
        internalBufferDays: buffer,
        advancePercentage: advance,
        vendorLeadTimeDays: lead,
      };
      const r = await saveVendorWorkflowAction({
        vendorCode: code,
        draft: edited,
        approve: true,
        sourceDescription: how,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft(null);
      setActiveWorkflow(r.data);
      setSavedNote("Workflow saved and active for this vendor.");
      load();
    });
  }

  const openOrders = orders.filter(
    (o) => !["received", "closed", "cancelled"].includes(o.status),
  );
  const history = orders.filter((o) =>
    ["received", "closed"].includes(o.status),
  );

  return (
    <>
      <Header
        title={vendor?.name ?? code}
        subtitle={vendor?.whatTheyMake || vendor?.category || "Vendor profile"}
        actions={
          <Link href="/manufacture/vendors">
            <Button size="sm" variant="outline">
              All vendors
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-20 space-y-8 max-w-6xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {savedNote ? <p className="text-sm text-deep-navy">{savedNote}</p> : null}
        {!vendor ? (
          <p className="text-sm text-charcoal/50">{pending ? "Loading…" : "Not found"}</p>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Contact", vendor.contactPerson || vendor.contact || "—"],
                ["WhatsApp", vendor.whatsappNumber || vendor.phone || "—"],
                [
                  "Vendor says",
                  `${vendor.statedLeadTimeDays ?? vendor.leadTimeDays ?? "—"} days`,
                ],
                ["Aarla buffer", `${vendor.internalBufferDays} days`],
                ["Advance", vendor.advancePercentage != null ? `${vendor.advancePercentage}%` : "—"],
                ["MOQ", String(vendor.moq || "—")],
                ["Terms", vendor.paymentTerms || "—"],
                ["Workflow", activeWorkflow ? "Approved" : "Not set"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-charcoal/45">{k}</p>
                  <p className="mt-1 text-sm font-medium text-deep-navy">{v}</p>
                </div>
              ))}
            </section>

            <section className="card-surface p-4 space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Profile</h2>
              <div className="flex flex-wrap gap-3">
                <label className="text-xs text-charcoal/60">
                  Contact person
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm min-w-[12rem]"
                  />
                </label>
                <label className="text-xs text-charcoal/60">
                  WhatsApp
                  <input
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm min-w-[12rem]"
                  />
                </label>
                <label className="text-xs text-charcoal/60">
                  Payment terms
                  <input
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm min-w-[12rem]"
                  />
                </label>
                <label className="text-xs text-charcoal/60">
                  Stated lead (days)
                  <input
                    type="number"
                    value={lead ?? ""}
                    onChange={(e) => setLead(e.target.value ? Number(e.target.value) : null)}
                    className="mt-1 block w-24 rounded-lg border border-border px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-charcoal/60">
                  Internal buffer (days)
                  <input
                    type="number"
                    value={buffer}
                    onChange={(e) => setBuffer(Number(e.target.value))}
                    className="mt-1 block w-24 rounded-lg border border-border px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-charcoal/60">
                  Advance %
                  <input
                    type="number"
                    value={advance ?? ""}
                    onChange={(e) =>
                      setAdvance(e.target.value ? Number(e.target.value) : null)
                    }
                    className="mt-1 block w-24 rounded-lg border border-border px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <Button size="sm" variant="outline" onClick={saveProfile} disabled={pending}>
                Save profile
              </Button>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">How this vendor works</h2>
              <p className="text-sm text-charcoal/60">
                Describe the real process in plain English. Generate a draft workflow, edit it, then
                approve — AI never auto-activates.
              </p>
              <textarea
                value={how}
                onChange={(e) => setHow(e.target.value)}
                placeholder="For Tiruppur tees, I WhatsApp the quantity and designs. He confirms…"
                className="w-full min-h-[10rem] rounded-xl border border-border p-4 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={saveHow} disabled={pending}>
                  Save description
                </Button>
                <Button size="sm" onClick={generate} disabled={pending || !how.trim()}>
                  Generate workflow
                </Button>
              </div>
            </section>

            {draft ? (
              <section className="card-surface p-4 space-y-4 border-aarla-red/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-lg text-deep-navy">
                    Workflow draft · {draft.source === "llm" ? "AI" : "heuristic"}
                  </h3>
                  <span className="text-xs uppercase text-charcoal/45">Review before activate</span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <label>
                    Vendor lead
                    <input
                      type="number"
                      className="ml-2 w-16 rounded border border-border px-1 py-0.5"
                      value={lead ?? ""}
                      onChange={(e) => setLead(e.target.value ? Number(e.target.value) : null)}
                    />
                  </label>
                  <label>
                    Internal buffer
                    <input
                      type="number"
                      className="ml-2 w-16 rounded border border-border px-1 py-0.5"
                      value={buffer}
                      onChange={(e) => setBuffer(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Advance %
                    <input
                      type="number"
                      className="ml-2 w-16 rounded border border-border px-1 py-0.5"
                      value={advance ?? ""}
                      onChange={(e) =>
                        setAdvance(e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </label>
                </div>
                <ul className="text-sm space-y-1 text-charcoal/70">
                  {Object.entries(draft.extractedRules).map(([k, v]) =>
                    v ? (
                      <li key={k}>
                        <span className="text-charcoal/45">{k}:</span> {v}
                      </li>
                    ) : null,
                  )}
                </ul>
                <ol className="space-y-1.5">
                  {draft.steps.map((s) => (
                    <li
                      key={s.sequence}
                      className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    >
                      {s.sequence}. {s.name}{" "}
                      <span className="text-xs text-charcoal/40">{s.stepType}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={approveWorkflow} disabled={pending}>
                    {pending ? "Saving…" : "Save workflow"}
                  </Button>
                  <Button variant="ghost" onClick={() => setDraft(null)}>
                    Discard draft
                  </Button>
                </div>
              </section>
            ) : null}

            {!draft && activeWorkflow ? (
              <section id="active-workflow" className="card-surface p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-xl text-deep-navy">Active workflow</h2>
                  <span className="text-xs uppercase tracking-wide text-charcoal/45">
                    {activeWorkflow.status}
                  </span>
                </div>
                <p className="text-sm text-charcoal/65">
                  {activeWorkflow.name} · lead {activeWorkflow.vendorLeadTimeDays ?? "—"}d · buffer{" "}
                  {activeWorkflow.internalBufferDays}d
                  {activeWorkflow.advancePercentage != null
                    ? ` · advance ${activeWorkflow.advancePercentage}%`
                    : ""}
                </p>
                <ol className="space-y-1.5">
                  {activeWorkflow.steps.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    >
                      {s.sequence}. {s.name}{" "}
                      <span className="text-xs text-charcoal/40">{s.stepType}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-charcoal/50">
                  New vendor orders for this supplier will start with this timeline. Generate again to
                  replace it.
                </p>
                <Link href="/manufacture/workflows">
                  <Button size="sm" variant="outline">
                    All workflows
                  </Button>
                </Link>
              </section>
            ) : null}

            {!draft && !activeWorkflow ? (
              <p className="text-sm text-charcoal/55">
                No active workflow yet. Generate from the description above, then Save workflow.
              </p>
            ) : null}

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Open orders</h2>
              {openOrders.length === 0 ? (
                <p className="text-sm text-charcoal/55">No open orders with this vendor.</p>
              ) : (
                openOrders.map((o) => (
                  <Link
                    key={o.orderNumber}
                    href={`/manufacture/orders/${encodeURIComponent(o.orderNumber)}`}
                    className="block rounded-xl border border-border bg-white px-4 py-3 text-sm hover:border-aarla-red/30"
                  >
                    {o.orderNumber} · {o.status.replaceAll("_", " ")}
                  </Link>
                ))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Previously bought</h2>
              {history.length === 0 ? (
                <p className="text-sm text-charcoal/55">
                  Completed batches will accumulate here for reliability learning.
                </p>
              ) : (
                history.map((o) => (
                  <Link
                    key={o.orderNumber}
                    href={`/manufacture/orders/${encodeURIComponent(o.orderNumber)}`}
                    className="block rounded-xl border border-border bg-white px-4 py-3 text-sm"
                  >
                    {o.orderNumber} · received/closed · committed {o.vendorCommittedDate ?? "—"}
                  </Link>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

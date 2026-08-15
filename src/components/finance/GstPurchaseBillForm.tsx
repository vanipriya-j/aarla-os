"use client";

import { useState, useTransition } from "react";
import { upsertPurchaseBillAction } from "@/app/actions/gst-actions";

const empty = {
  vendorName: "",
  vendorGstin: "",
  invoiceNumber: "",
  invoiceDate: "",
  taxableValue: "",
  cgst: "0",
  sgst: "0",
  igst: "0",
  cess: "",
  totalTax: "",
  invoiceTotal: "",
  notes: "",
};

export function GstPurchaseBillForm({ onSaved }: { onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(empty);

  function set(key: keyof typeof empty, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    startTransition(async () => {
      setError(null);
      const taxableValue = Number(form.taxableValue);
      const cgst = Number(form.cgst || 0);
      const sgst = Number(form.sgst || 0);
      const igst = Number(form.igst || 0);
      const cess = form.cess === "" ? null : Number(form.cess);
      const totalTax =
        form.totalTax === "" ? cgst + sgst + igst + (cess ?? 0) : Number(form.totalTax);
      const invoiceTotal = Number(form.invoiceTotal);
      const res = await upsertPurchaseBillAction({
        vendorName: form.vendorName,
        vendorGstin: form.vendorGstin || null,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate || null,
        taxableValue,
        cgst,
        sgst,
        igst,
        cess,
        totalTax,
        invoiceTotal,
        notes: form.notes,
        source: "manual",
        reviewStatus: "PENDING_REVIEW",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setForm(empty);
      onSaved();
    });
  }

  return (
    <div className="space-y-3" data-testid="gst-purchase-form">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(
          [
            ["vendorName", "Vendor name"],
            ["vendorGstin", "Vendor GSTIN"],
            ["invoiceNumber", "Invoice number"],
            ["invoiceDate", "Invoice date (YYYY-MM-DD)"],
            ["taxableValue", "Taxable value"],
            ["cgst", "CGST"],
            ["sgst", "SGST"],
            ["igst", "IGST"],
            ["cess", "Cess (optional)"],
            ["totalTax", "Total tax"],
            ["invoiceTotal", "Invoice total"],
            ["notes", "Notes"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm space-y-1">
            <span className="text-charcoal/60">{label}</span>
            <input
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-full bg-aarla-red text-white px-4 py-1.5 text-sm disabled:opacity-50"
      >
        {pending ? "Saving…" : "Add purchase bill"}
      </button>
    </div>
  );
}

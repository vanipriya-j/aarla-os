"use client";

import { useState, useTransition } from "react";
import type { OrganizationAccountantSettings } from "@/lib/domain/gst-types";
import { saveGstSettingsAction } from "@/app/actions/gst-actions";

export function GstSettingsForm({
  settings,
  onSaved,
}: {
  settings: OrganizationAccountantSettings;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    legalName: settings.legalName,
    gstin: settings.gstin,
    state: settings.state,
    accountantName: settings.accountantName,
    accountantEmail: settings.accountantEmail,
    financialYearStartMonth: settings.financialYearStartMonth || 4,
  });

  function save() {
    startTransition(async () => {
      setError(null);
      const res = await saveGstSettingsAction(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="space-y-3" data-testid="gst-settings-form">
      <div className="grid sm:grid-cols-2 gap-3">
        {(
          [
            ["legalName", "Legal name"],
            ["gstin", "GSTIN"],
            ["state", "State"],
            ["accountantName", "Accountant name"],
            ["accountantEmail", "Accountant email"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm space-y-1">
            <span className="text-charcoal/60">{label}</span>
            <input
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </label>
        ))}
        <label className="block text-sm space-y-1">
          <span className="text-charcoal/60">FY start month</span>
          <input
            type="number"
            min={1}
            max={12}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            value={form.financialYearStartMonth}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                financialYearStartMonth: Number(e.target.value) || 4,
              }))
            }
          />
        </label>
      </div>
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-full bg-deep-navy text-white px-4 py-1.5 text-sm disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { GstStatusChip } from "@/components/finance/GstStatusChip";
import { GstSalesPanel } from "@/components/finance/GstSalesPanel";
import { GstPurchasesList } from "@/components/finance/GstPurchasesList";
import { GstPurchaseBillForm } from "@/components/finance/GstPurchaseBillForm";
import { GstExceptionsList } from "@/components/finance/GstExceptionsList";
import { GstSettingsForm } from "@/components/finance/GstSettingsForm";
import { GstPackPanel } from "@/components/finance/GstPackPanel";
import {
  getGstBoardAction,
  setGstPeriodStatusAction,
} from "@/app/actions/gst-actions";
import type { GstBoard, GstPeriodStatus } from "@/lib/domain/gst-types";
import { financialYearForDate } from "@/lib/domain/gst-validation";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function fyOptions(around: string): string[] {
  const start = Number(around.split("-")[0]);
  if (!Number.isFinite(start)) return [around];
  return [
    `${start - 1}-${String(start).slice(-2)}`,
    around,
    `${start + 1}-${String(start + 2).slice(-2)}`,
  ];
}

export default function GstReconciliationPage() {
  const defaults = useMemo(() => financialYearForDate(new Date()), []);
  const [fy, setFy] = useState(defaults.financialYear);
  const [month, setMonth] = useState(defaults.month);
  const [board, setBoard] = useState<GstBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback((nextFy?: string, nextMonth?: number) => {
    const f = nextFy ?? fy;
    const m = nextMonth ?? month;
    startTransition(async () => {
      setError(null);
      const res = await getGstBoardAction(f, m);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBoard(res.data);
      setFy(res.data.period.financialYear);
      setMonth(res.data.period.month);
    });
  }, [fy, month]);

  useEffect(() => {
    load(defaults.financialYear, defaults.month);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  function transition(status: GstPeriodStatus) {
    startTransition(async () => {
      setError(null);
      const res = await setGstPeriodStatusAction(fy, month, status);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBoard(res.data);
    });
  }

  const status = board?.period.status;
  const canNeedsReview = status === "COLLECTING" || status === "READY" || status === "SENT";
  const canReady = status === "NEEDS_REVIEW";
  const canCollecting = status === "NEEDS_REVIEW";

  return (
    <>
      <Header
        title="GST Reconciliation"
        subtitle="Monthly sales + purchase capture and accountant pack — not GST filing software."
      />
      <main
        className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-8 max-w-6xl"
        data-testid="gst-board"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm space-y-1">
              <span className="block text-charcoal/55">Financial year</span>
              <select
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={fy}
                onChange={(e) => {
                  setFy(e.target.value);
                  load(e.target.value, month);
                }}
                data-testid="gst-fy"
              >
                {fyOptions(fy).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="block text-charcoal/55">Month</span>
              <select
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={month}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  setMonth(m);
                  load(fy, m);
                }}
                data-testid="gst-month"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {board ? <GstStatusChip status={board.period.status} /> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canCollecting ? (
              <button
                type="button"
                onClick={() => transition("COLLECTING")}
                disabled={pending}
                className="rounded-full border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Back to Collecting
              </button>
            ) : null}
            {canNeedsReview && status === "COLLECTING" ? (
              <button
                type="button"
                onClick={() => transition("NEEDS_REVIEW")}
                disabled={pending}
                className="rounded-full border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Needs Review
              </button>
            ) : null}
            {canNeedsReview && (status === "READY" || status === "SENT") ? (
              <button
                type="button"
                onClick={() => transition("NEEDS_REVIEW")}
                disabled={pending}
                className="rounded-full border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Re-open review
              </button>
            ) : null}
            {canReady ? (
              <button
                type="button"
                onClick={() => transition("READY")}
                disabled={pending}
                className="rounded-full bg-deep-navy text-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Mark Ready
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => load()}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-full bg-deep-navy text-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-aarla-red">
            {error}
            {" — "}
            <Link href="/setup" className="underline">
              run /setup
            </Link>{" "}
            (migrations only) if GST tables are missing.
          </p>
        ) : null}

        {!board && !error ? (
          <p className="text-sm text-charcoal/50">Loading GST board…</p>
        ) : null}

        {board ? (
          <>
            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Sales</h2>
              <p className="text-sm text-charcoal/55">
                Valid INR Shopify orders in this month. Tax columns need a re-sync after
                deploy.
              </p>
              <GstSalesPanel totals={board.sales.totals} rows={board.sales.rows} />
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Purchases</h2>
              <p className="text-sm text-charcoal/55">
                Tax invoices only — not manufacturing purchase orders.
              </p>
              <GstPurchasesList
                totals={board.purchases.totals}
                bills={board.purchases.bills}
              />
              <GstPurchaseBillForm onSaved={() => load()} />
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">
                Exceptions ({board.exceptions.length})
              </h2>
              <GstExceptionsList exceptions={board.exceptions} />
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Accountant pack</h2>
              <GstPackPanel
                board={board}
                onChanged={(next) => (next ? setBoard(next) : load())}
              />
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Organisation settings</h2>
              <GstSettingsForm settings={board.settings} onSaved={() => load()} />
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}

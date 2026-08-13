"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { MetricStatusCard } from "@/components/weekly/MetricStatusCard";
import { DailyStrip } from "@/components/weekly/DailyStrip";
import { ManualMetricEditor } from "@/components/weekly/ManualMetricEditor";
import { RetailersWeekPanel, VendorsWeekPanel } from "@/components/weekly/OpsLists";
import { getWeeklyBoardAction } from "@/app/actions/operating-metrics-actions";
import type { WeeklyBoard } from "@/lib/domain/operating-metrics-types";
import { isoDate, shiftWeek, weekStartMonday } from "@/lib/domain/operating-week";

function addDaysIso(weekStart: string, days: number): string {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export default function WeeklyBoardPage() {
  const [board, setBoard] = useState<WeeklyBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback((weekStart?: string) => {
    startTransition(async () => {
      setError(null);
      const res = await getWeeklyBoardAction(weekStart);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBoard(res.data);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function go(delta: number) {
    if (!board) return;
    const next = isoDate(shiftWeek(weekStartMonday(new Date(`${board.weekStart}T00:00:00.000Z`)), delta));
    load(next);
  }

  function goThisWeek() {
    load();
  }

  const todayOrders = board?.dailyStrip.find((d) => d.isToday)?.orders ?? 0;
  const todayRevenue = board?.dailyStrip.find((d) => d.isToday)?.revenue ?? 0;
  const elapsedDays = board
    ? board.isPastWeek
      ? 7
      : board.isFutureWeek
        ? 0
        : Math.max(1, board.todayIndex + 1)
    : 1;
  const ordersAvg = board ? board.metrics.orders.actual / elapsedDays : 0;
  const revenueAvg = board ? board.metrics.revenue.actual / elapsedDays : 0;

  return (
    <>
      <Header
        title="This Week"
        subtitle="Are we doing what we need to do this week? Operating board — not an analytics suite."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl" data-testid="weekly-board">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-2xl text-deep-navy">
              {board?.weekLabel ?? "Loading…"}
            </p>
            {board ? (
              <p className="text-sm text-charcoal/55">
                {board.weekStart} → {addDaysIso(board.weekStart, 6)}
                {" · "}
                {board.timezone}
                {board.isCurrentWeek ? " · this week" : board.isPastWeek ? " · past" : " · upcoming"}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="week-prev"
              onClick={() => go(-1)}
              disabled={pending || !board}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              type="button"
              data-testid="week-current"
              onClick={goThisWeek}
              disabled={pending}
              className="rounded-full border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              This week
            </button>
            <button
              type="button"
              data-testid="week-next"
              onClick={() => go(1)}
              disabled={pending || !board}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => board && load(board.weekStart)}
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
            (migrations only, demo seed off) if tables are missing.
          </p>
        ) : null}

        {!board && !error ? (
          <p className="text-sm text-charcoal/50">Loading weekly board…</p>
        ) : null}

        {board ? (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricStatusCard
                card={board.metrics.orders}
                sourceHint="Shopify synced orders (valid)"
              />
              <MetricStatusCard
                card={board.metrics.revenue}
                sourceHint="Shopify synced revenue (INR)"
              />
              <MetricStatusCard card={board.metrics.followers} sourceHint="Source: manual" />
              <MetricStatusCard card={board.metrics.views} sourceHint="Source: manual" />
            </div>

            <section className="rounded-xl border border-border bg-white/80 p-4 space-y-4">
              <div>
                <h2 className="font-display text-lg text-deep-navy">Orders & revenue</h2>
                <p className="text-sm text-charcoal/55">
                  Today · week-to-date · daily average · weekly target from org config
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-charcoal/50">Orders today</p>
                  <p className="font-display text-xl text-deep-navy">{todayOrders}</p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-charcoal/50">Orders WTD</p>
                  <p className="font-display text-xl text-deep-navy">
                    {board.metrics.orders.actual}
                    <span className="text-sm text-charcoal/45 font-sans font-normal">
                      {" "}
                      / {board.metrics.orders.target}
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-charcoal/50">Orders daily avg</p>
                  <p className="font-display text-xl text-deep-navy">{ordersAvg.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-charcoal/50">Daily order target</p>
                  <p className="font-display text-xl text-deep-navy">
                    {board.targets.ordersPerDay}
                  </p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-charcoal/50">Revenue today</p>
                  <p className="font-display text-xl text-deep-navy">
                    ₹{Math.round(todayRevenue).toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-charcoal/50">Revenue WTD</p>
                  <p className="font-display text-xl text-deep-navy">
                    ₹{Math.round(board.metrics.revenue.actual).toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-charcoal/50">Revenue daily avg</p>
                  <p className="font-display text-xl text-deep-navy">
                    ₹{Math.round(revenueAvg).toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-charcoal/50">Expected WTD revenue</p>
                  <p className="font-display text-xl text-deep-navy">
                    ₹{Math.round(board.metrics.revenue.expectedByNow).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6 pt-2">
                <DailyStrip points={board.dailyStrip} kind="orders" />
                <DailyStrip points={board.dailyStrip} kind="revenue" />
              </div>
            </section>

            <ManualMetricEditor
              weekStart={board.weekStart}
              followers={
                board.manualMetrics.followers.updatedAt !== null
                  ? board.manualMetrics.followers.value
                  : null
              }
              views={
                board.manualMetrics.views.updatedAt !== null
                  ? board.manualMetrics.views.value
                  : null
              }
              onSaved={() => load(board.weekStart)}
            />

            <div className="grid lg:grid-cols-2 gap-4">
              <RetailersWeekPanel
                rows={board.retailers.rows}
                completed={board.retailers.completedThisWeek}
                total={board.retailers.totalActive}
              />
              <VendorsWeekPanel
                pending={board.vendors.pending}
                completed={board.vendors.completedThisWeek}
              />
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}

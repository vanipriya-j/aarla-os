"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCampaignAction } from "@/app/actions/campaign-actions";
import type { Campaign } from "@/lib/domain/campaign-types";
import { CampaignStatusChip } from "@/components/campaigns/CampaignStatusChip";
import { formatINR } from "@/lib/domain";

interface CampaignListClientProps {
  initialCampaigns: Campaign[];
  loadError?: string | null;
}

export function CampaignListClient({
  initialCampaigns,
  loadError,
}: CampaignListClientProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dailyAdBudget, setDailyAdBudget] = useState("");
  const [plannedAdSpend, setPlannedAdSpend] = useState("");
  const [targetRevenue, setTargetRevenue] = useState("");
  const [targetOrders, setTargetOrders] = useState("");
  const [targetAov, setTargetAov] = useState("");

  const sorted = useMemo(
    () =>
      [...campaigns].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [campaigns],
  );

  function create(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setError(null);
      const res = await createCampaignAction({
        name,
        startDate,
        endDate,
        dailyAdBudget: dailyAdBudget ? Number(dailyAdBudget) : 0,
        plannedAdSpend: plannedAdSpend ? Number(plannedAdSpend) : 0,
        targetRevenue: targetRevenue ? Number(targetRevenue) : null,
        targetOrders: targetOrders ? Number(targetOrders) : null,
        targetAov: targetAov ? Number(targetAov) : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCampaigns((prev) => [res.data, ...prev]);
      setName("");
      router.push(`/campaigns/${res.data.id}`);
    });
  }

  return (
    <div className="space-y-8" data-testid="campaigns-list">
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}

      <section className="rounded-xl border border-border bg-white p-5 space-y-4">
        <div>
          <h2 className="font-display text-xl text-deep-navy">New campaign</h2>
          <p className="text-sm text-charcoal/55 mt-1">
            Plan inventory soft-holds against ad spend and revenue targets. Soft
            allocation does not move stock.
          </p>
        </div>
        <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm space-y-1 md:col-span-2">
            <span className="block text-charcoal/55">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              data-testid="campaign-name"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">Start date</span>
            <input
              required
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">End date</span>
            <input
              required
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">Daily ad budget (₹)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={dailyAdBudget}
              onChange={(e) => setDailyAdBudget(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">Planned ad spend (₹)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={plannedAdSpend}
              onChange={(e) => setPlannedAdSpend(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">Target revenue (₹)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={targetRevenue}
              onChange={(e) => setTargetRevenue(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">Target orders</span>
            <input
              type="number"
              min={0}
              step="1"
              value={targetOrders}
              onChange={(e) => setTargetOrders(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-charcoal/55">Target AOV (₹)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={targetAov}
              onChange={(e) => setTargetAov(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-aarla-red text-white px-4 py-2 text-sm disabled:opacity-50"
              data-testid="campaign-create"
            >
              {pending ? "Creating…" : "Create campaign"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl text-deep-navy">Campaigns</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-charcoal/55">No campaigns yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-white">
            {sorted.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="font-medium text-deep-navy hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="text-xs text-charcoal/55 mt-0.5">
                    {c.startDate} → {c.endDate}
                    {" · "}
                    Planned ads {formatINR(c.plannedAdSpend)}
                  </p>
                </div>
                <CampaignStatusChip status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

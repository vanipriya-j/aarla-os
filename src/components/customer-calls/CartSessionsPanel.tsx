"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import {
  enqueueIdentifiedAbandonedCartsAction,
  listCartDashboardAction,
  markCartSessionRecoveredAction,
  refreshCartSessionStatusesAction,
} from "@/app/actions/commerce-cart-actions";
import type {
  CartDashboardCounts,
  CartSessionStatus,
} from "@/lib/domain/commerce-cart-types";
import type { CartSessionListRow } from "@/lib/repositories/commerce-cart";
import { ExternalLink, RefreshCw } from "lucide-react";

const STATUS_FILTERS: { id: "all" | CartSessionStatus; label: string }[] = [
  { id: "all", label: "All live" },
  { id: "ACTIVE", label: "Active" },
  { id: "CART_ABANDONED", label: "Cart abandoned" },
  { id: "CHECKOUT_ABANDONED", label: "Checkout abandoned" },
  { id: "IDENTIFIED", label: "Identified" },
  { id: "RECOVERED", label: "Recovered" },
];

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

export function CartSessionsPanel() {
  const [counts, setCounts] = useState<CartDashboardCounts | null>(null);
  const [sessions, setSessions] = useState<CartSessionListRow[]>([]);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]["id"]>("all");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback((status: (typeof STATUS_FILTERS)[number]["id"]) => {
    startTransition(async () => {
      setError(null);
      const res = await listCartDashboardAction(
        status === "all"
          ? {
              status: [
                "ACTIVE",
                "CART_ABANDONED",
                "CHECKOUT_ABANDONED",
                "IDENTIFIED",
                "OUTREACH_PENDING",
                "RECOVERED",
              ],
              limit: 40,
            }
          : { status, limit: 40 },
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCounts(res.data.counts);
      setSessions(res.data.sessions);
    });
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  function refreshStatuses() {
    startTransition(async () => {
      setError(null);
      setNote(null);
      const res = await refreshCartSessionStatusesAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNote(`Refreshed ${res.data.updated} session status(es).`);
      load(filter);
    });
  }

  function enqueueIdentified() {
    startTransition(async () => {
      setError(null);
      setNote(null);
      const res = await enqueueIdentifiedAbandonedCartsAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const d = res.data;
      setNote(
        `Enqueue: ${d.created} created · ${d.updated} updated · skipped anon ${d.skippedAnonymous} / consent ${d.skippedConsent} / DNC ${d.skippedDnc}. No messages auto-sent.`,
      );
      load(filter);
    });
  }

  function markRecovered(id: string) {
    startTransition(async () => {
      setError(null);
      const res = await markCartSessionRecoveredAction(id, {
        notes: "Marked recovered manually from Live carts",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      load(filter);
    });
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-white p-4"
      data-testid="cart-sessions-panel"
    >
      <div className="space-y-1">
        <h2 className="font-display text-lg text-deep-navy">Live carts</h2>
        <p className="text-sm text-charcoal/60">
          Pixel demand signal — not inventory. Does not soft-reserve or move stock.
          Enqueue only adds identified abandoned carts to the Abandoned Cart call queue
          (no auto WhatsApp/email).
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <CountTile label="Active" value={counts?.active} />
        <CountTile label="Anonymous abandoned" value={counts?.anonymousAbandoned} />
        <CountTile label="Identified abandoned" value={counts?.identifiedAbandoned} />
        <CountTile label="Recovered" value={counts?.recovered} />
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs border ${
              filter === f.id
                ? "bg-deep-navy text-white border-deep-navy"
                : "bg-white border-border text-deep-navy"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={refreshStatuses}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-deep-navy disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
          Refresh statuses
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={enqueueIdentified}
          className="rounded-full bg-deep-navy px-3 py-1.5 text-sm text-white disabled:opacity-50"
          data-testid="enqueue-identified-carts"
        >
          Enqueue identified → Abandoned Cart queue
        </button>
      </div>

      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      {note ? <p className="text-xs text-charcoal/55">{note}</p> : null}

      {sessions.length === 0 ? (
        <p className="text-sm text-charcoal/55">
          No cart sessions yet. With the pixel connected, add a product to cart on the
          storefront (product views alone do not create a live cart). Then refresh.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg">
          {sessions.map((s) => (
            <li key={s.id} className="px-3 py-2.5 flex flex-wrap items-start gap-3 justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={s.status} tone={statusToneFromLabel(s.status)} />
                  <span className="text-sm font-medium text-deep-navy">
                    {s.customerName || s.email || s.phone || "Anonymous"}
                  </span>
                  <span className="text-xs text-charcoal/50">
                    {formatMoney(s.cartValue, s.currency)} · {s.itemCount} item(s)
                  </span>
                </div>
                <p className="text-xs text-charcoal/55">
                  Last activity {new Date(s.lastActivityAt).toLocaleString()}
                  {s.phone ? ` · ${s.phone}` : ""}
                  {s.utmCampaign ? ` · utm:${s.utmCampaign}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.recoveryUrl ? (
                  <a
                    href={s.recoveryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-deep-navy"
                  >
                    Recovery URL <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
                {s.status !== "RECOVERED" && s.status !== "CONVERTED" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => markRecovered(s.id)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-deep-navy disabled:opacity-50"
                  >
                    Mark recovered
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CountTile({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-border bg-soft-beige/40 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-charcoal/50">{label}</p>
      <p className="text-lg font-medium text-deep-navy">{value ?? "—"}</p>
    </div>
  );
}

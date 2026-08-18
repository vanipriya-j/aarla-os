"use client";

import { useEffect, useState, useTransition } from "react";
import { getCampaignFunnelAction } from "@/app/actions/commerce-cart-actions";
import type {
  CampaignDemandByVariant,
  CampaignFunnelCounts,
} from "@/lib/domain/commerce-cart-types";

const EMPTY_FUNNEL: CampaignFunnelCounts = {
  productViewed: 0,
  addedToCart: 0,
  cartViewed: 0,
  checkoutStarted: 0,
  contactSubmitted: 0,
  purchased: 0,
};

interface CampaignFunnelPanelProps {
  campaignId: string;
  startDate: string;
  endDate: string;
  /** When false, still show the panel but with a quieter heading. */
  isLive?: boolean;
}

export function CampaignFunnelPanel({
  campaignId,
  startDate,
  endDate,
  isLive = false,
}: CampaignFunnelPanelProps) {
  const [funnel, setFunnel] = useState<CampaignFunnelCounts>(EMPTY_FUNNEL);
  const [demand, setDemand] = useState<CampaignDemandByVariant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      const startIso = `${startDate}T00:00:00.000Z`;
      const endIso = `${endDate}T23:59:59.999Z`;
      const res = await getCampaignFunnelAction(campaignId, startIso, endIso);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFunnel(res.data.funnel);
      setDemand(res.data.demand);
    });
  }, [campaignId, startDate, endDate]);

  const stages: { label: string; value: number }[] = [
    { label: "Product viewed", value: funnel.productViewed },
    { label: "Added to cart", value: funnel.addedToCart },
    { label: "Cart viewed", value: funnel.cartViewed },
    { label: "Checkout started", value: funnel.checkoutStarted },
    { label: "Contact submitted", value: funnel.contactSubmitted },
    { label: "Purchased", value: funnel.purchased },
  ];

  return (
    <section
      className="rounded-xl border border-border bg-white p-4 space-y-4"
      data-testid="campaign-funnel-panel"
    >
      <div className="space-y-1">
        <h2 className="font-display text-lg text-deep-navy">
          {isLive ? "Live commerce funnel" : "Commerce funnel"}
        </h2>
        <p className="text-sm text-charcoal/60">
          Pixel events attributed by campaign_id / UTM. Demand units below are cart
          signal only — inventory is not reduced.
        </p>
      </div>

      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      {pending ? <p className="text-xs text-charcoal/50">Loading funnel…</p> : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {stages.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-border bg-soft-beige/40 px-3 py-2"
          >
            <p className="text-[11px] uppercase tracking-wide text-charcoal/50">{s.label}</p>
            <p className="text-lg font-medium text-deep-navy">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-deep-navy">Demand by variant</h3>
        {demand.length === 0 ? (
          <p className="text-sm text-charcoal/55">
            No cart-session demand attributed to this campaign yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-charcoal/50 border-b border-border">
                  <th className="py-2 pr-3">Variant</th>
                  <th className="py-2 pr-3">Active cart</th>
                  <th className="py-2 pr-3">Checkout</th>
                  <th className="py-2 pr-3">Identified abandoned</th>
                  <th className="py-2">Anonymous abandoned</th>
                </tr>
              </thead>
              <tbody>
                {demand.map((row, i) => (
                  <tr key={`${row.variantExternalId ?? row.sku ?? row.title}-${i}`} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      <span className="text-deep-navy">{row.title}</span>
                      {row.sku ? (
                        <span className="block text-xs text-charcoal/45">{row.sku}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{row.activeCartUnits}</td>
                    <td className="py-2 pr-3">{row.checkoutUnits}</td>
                    <td className="py-2 pr-3">{row.identifiedAbandonedUnits}</td>
                    <td className="py-2">{row.anonymousAbandonedUnits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { CampaignListClient } from "@/components/campaigns/CampaignListClient";
import { listCampaignsAction } from "@/app/actions/campaign-actions";
import type { Campaign } from "@/lib/domain/campaign-types";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const res = await listCampaignsAction();
      if (!res.ok) {
        setError(res.error);
        setLoaded(true);
        return;
      }
      setCampaigns(res.data);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Header
        title="Campaigns"
        subtitle="Ops campaign & inventory planner — soft Studio holds, not Universe creative nodes."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 max-w-6xl">
        {!loaded && pending ? (
          <p className="text-sm text-charcoal/55">Loading campaigns…</p>
        ) : (
          <CampaignListClient initialCampaigns={campaigns} loadError={error} />
        )}
      </main>
    </>
  );
}

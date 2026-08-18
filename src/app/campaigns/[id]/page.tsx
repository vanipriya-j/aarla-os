"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { CampaignPlannerClient } from "@/components/campaigns/CampaignPlannerClient";
import { getCampaignBoardAction } from "@/app/actions/campaign-actions";
import { listProductsAction } from "@/app/actions/app-actions";
import type { CampaignBoard } from "@/lib/domain/campaign-types";
import type { Product } from "@/lib/domain/types";

export default function CampaignDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [board, setBoard] = useState<CampaignBoard | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    if (!id) return;
    startTransition(async () => {
      setError(null);
      const [boardRes, productsRes] = await Promise.all([
        getCampaignBoardAction(id),
        listProductsAction(),
      ]);
      if (!boardRes.ok) {
        setError(boardRes.error);
        return;
      }
      if (!productsRes.ok) {
        setError(productsRes.error);
        return;
      }
      setBoard(boardRes.data);
      setProducts(productsRes.data);
    });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Header
        title="Campaign planner"
        subtitle="Soft-allocate Studio stock · readiness · contribution after ads"
        actions={
          <Link
            href="/campaigns"
            className="rounded-full border border-border bg-white px-3 py-1.5 text-sm"
          >
            All campaigns
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 max-w-6xl">
        {error ? <p className="text-sm text-aarla-red mb-4">{error}</p> : null}
        {!board && pending ? (
          <p className="text-sm text-charcoal/55">Loading planner…</p>
        ) : null}
        {board ? (
          <CampaignPlannerClient initialBoard={board} products={products} />
        ) : null}
      </main>
    </>
  );
}

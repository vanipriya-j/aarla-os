"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { listWorkflowTemplatesAction } from "@/app/actions/manufacture-actions";
import type { WorkflowTemplate } from "@/lib/domain/manufacture-types";

export default function ManufactureWorkflowsPage() {
  const [pending, startTransition] = useTransition();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const r = await listWorkflowTemplatesAction();
      if (!r.ok) setError(r.error);
      else setTemplates(r.data);
    });
  }, []);

  return (
    <>
      <Header
        title="Workflows"
        subtitle="Approved “how this vendor works” templates — reused when creating vendor orders."
        actions={
          <Link href="/manufacture/vendors">
            <Button size="sm" variant="outline">
              Vendors
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-4 max-w-6xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {pending && !templates.length ? (
          <p className="text-sm text-charcoal/50">Loading…</p>
        ) : null}
        {templates.map((t) => (
          <article key={t.id} className="card-surface p-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium text-deep-navy">{t.name}</p>
              <span className="text-xs uppercase text-charcoal/45">{t.status}</span>
            </div>
            <p className="text-sm text-charcoal/60">
              {t.steps.length} steps · lead {t.vendorLeadTimeDays ?? "—"}d · buffer{" "}
              {t.internalBufferDays}d
              {t.advancePercentage != null ? ` · advance ${t.advancePercentage}%` : ""}
            </p>
            <ol className="text-xs text-charcoal/55 space-y-0.5">
              {t.steps.slice(0, 8).map((s) => (
                <li key={s.id}>
                  {s.sequence}. {s.name}
                </li>
              ))}
              {t.steps.length > 8 ? <li>…</li> : null}
            </ol>
            {t.vendorId ? (
              <Link
                href={`/manufacture/vendors/${encodeURIComponent(t.vendorId)}`}
                className="text-sm text-aarla-red"
              >
                Open vendor
              </Link>
            ) : null}
          </article>
        ))}
        {!pending && !templates.length ? (
          <p className="text-sm text-charcoal/55">
            No workflows yet. Open a vendor → How this vendor works → Generate workflow → Save.
          </p>
        ) : null}
      </main>
    </>
  );
}

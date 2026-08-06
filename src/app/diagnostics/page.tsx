"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { FormSection } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import type { DiagnosticsReport } from "@/lib/application/system-diagnostics";
import { Activity } from "lucide-react";

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2 text-sm">
      <span className="text-charcoal/70">{label}</span>
      <StatusChip label={ok ? "OK" : "Issue"} tone={ok ? "success" : "danger"} />
    </div>
  );
}

export default function DiagnosticsPage() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [setupSecret, setSetupSecret] = useState("");

  const load = useCallback((probeShopify = false, secret = "") => {
    startTransition(async () => {
      setError(null);
      try {
        const url = probeShopify
          ? `/api/diagnostics?probe=shopify&secret=${encodeURIComponent(secret)}`
          : "/api/diagnostics";
        const res = await fetch(url, { cache: "no-store" });
        const body = (await res.json()) as DiagnosticsReport & { error?: string };
        if (!res.ok && body.error) {
          setError(body.error);
          return;
        }
        setReport(body);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <>
      <Header
        title="System diagnostics"
        subtitle="Health of database, Shopify, and Delhivery wiring — no secrets shown."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-4xl" data-testid="diagnostics-page">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="diagnostics-refresh"
            onClick={() => load(false, "")}
            disabled={pending}
            className="inline-flex items-center gap-2 text-sm rounded-full px-4 py-2 bg-deep-navy text-white disabled:opacity-60"
          >
            <Activity className="h-4 w-4" />
            Refresh
          </button>
          {pending ? <StatusChip label="Loading…" tone="neutral" /> : null}
          {report ? (
            <StatusChip
              label={report.ok ? "System OK" : "Needs attention"}
              tone={report.ok ? "success" : "danger"}
            />
          ) : null}
        </div>

        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}

        {report ? (
          <>
            <FormSection title="Database" description={`Checked ${report.timestamp}`}>
              <div className="grid sm:grid-cols-2 gap-2">
                <Flag ok={report.database.ok} label="Connection" />
                <Flag
                  ok={report.database.latencyMs != null && report.database.latencyMs < 2000}
                  label={`Latency ${report.database.latencyMs ?? "—"} ms`}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-2 mt-3">
                {Object.entries(report.database.tables).map(([name, exists]) => (
                  <Flag key={name} ok={exists} label={name} />
                ))}
              </div>
              {report.database.error ? (
                <p className="text-sm text-aarla-red mt-2">{report.database.error}</p>
              ) : null}
            </FormSection>

            <FormSection
              title="Shopify"
              description="Config presence only. Use probe to verify token exchange + shop ping."
            >
              <div className="grid sm:grid-cols-2 gap-2">
                <Flag ok={report.shopify.configured} label="Configured" />
                <Flag ok={report.shopify.storeDomainSet} label="Store domain set" />
                <Flag ok={report.shopify.clientIdSet} label="Client ID set" />
                <Flag ok={report.shopify.clientSecretSet} label="Client secret set" />
                <Flag ok={report.shopify.staticTokenSet} label="Static token set (optional)" />
              </div>
              <p className="text-sm text-charcoal/65 mt-3">
                Auth mode: <span className="text-deep-navy">{report.shopify.authMode}</span>
                {" · "}
                API {report.shopify.apiVersion}
              </p>
              {report.shopify.probe ? (
                <p className="text-sm mt-2">
                  Probe:{" "}
                  {report.shopify.probe.ok
                    ? `OK (${report.shopify.probe.latencyMs} ms)`
                    : report.shopify.probe.error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 mt-4 items-end">
                <label className="text-sm">
                  <span className="block text-charcoal/60 mb-1">Setup secret (for probe)</span>
                  <input
                    type="password"
                    value={setupSecret}
                    onChange={(e) => setSetupSecret(e.target.value)}
                    className="rounded-[10px] border border-border px-3 py-2 text-sm"
                    placeholder="SETUP_SECRET"
                  />
                </label>
                <button
                  type="button"
                  data-testid="diagnostics-probe-shopify"
                  disabled={pending || !setupSecret}
                  onClick={() => load(true, setupSecret)}
                  className="text-sm rounded-full px-4 py-2 border border-border hover:border-aarla-red/40 disabled:opacity-50"
                >
                  Probe Shopify
                </button>
              </div>
            </FormSection>

            <FormSection title="Delhivery" description="Tracking connector readiness.">
              <div className="grid sm:grid-cols-2 gap-2">
                <Flag ok={report.delhivery.configured} label="Configured / fixture" />
                <Flag ok={report.delhivery.tokenSet} label="API token set" />
              </div>
              <p className="text-sm text-charcoal/65 mt-3">
                Base URL: {report.delhivery.baseUrl}
                {report.delhivery.fixtureMode ? " · fixture mode ON" : ""}
              </p>
            </FormSection>

            <FormSection title="Commerce counts" description="Rows currently in Postgres.">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {(
                  [
                    ["Customers", report.commerce.externalCustomers],
                    ["Orders", report.commerce.externalOrders],
                    ["Fulfilments", report.commerce.externalFulfilments],
                    ["AWBs", report.commerce.fulfilmentsWithAwb],
                    ["Shipments", report.commerce.shipments],
                    ["Delivered", report.commerce.shipmentsDelivered],
                    ["In transit+", report.commerce.shipmentsInTransit],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="border border-border rounded-lg px-3 py-2">
                    <dt className="text-xs text-charcoal/55">{label}</dt>
                    <dd className="font-medium text-deep-navy mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
            </FormSection>

            <FormSection title="Customer Calls" description="Live queues from Shopify + Delhivery after Refresh call queues / Sync All.">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div className="border border-border rounded-lg px-3 py-2">
                  <dt className="text-xs text-charcoal/55">Segments</dt>
                  <dd className="font-medium text-deep-navy mt-0.5">
                    {report.customerCalls.segments}
                  </dd>
                </div>
                <div className="border border-border rounded-lg px-3 py-2">
                  <dt className="text-xs text-charcoal/55">Queue items</dt>
                  <dd className="font-medium text-deep-navy mt-0.5">
                    {report.customerCalls.queueItems}
                  </dd>
                </div>
                <div className="border border-border rounded-lg px-3 py-2">
                  <dt className="text-xs text-charcoal/55">Interactions</dt>
                  <dd className="font-medium text-deep-navy mt-0.5">
                    {report.customerCalls.interactions}
                  </dd>
                </div>
              </dl>
            </FormSection>
          </>
        ) : null}

        <p className="text-xs text-charcoal/50">
          APIs: <code>/api/health</code> · <code>/api/diagnostics</code> ·{" "}
          <code>/api/diagnostics?probe=shopify</code> (requires setup secret)
        </p>
      </main>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { FormSection, Field, inputClass } from "@/components/ui/FormSection";
import {
  listWorkLocationsAction,
  upsertWorkLocationAction,
} from "@/app/actions/team-actions";
import type { WorkLocation, WorkLocationType } from "@/lib/domain/team-types";

export default function TeamLocationsPage() {
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [locationType, setLocationType] = useState<WorkLocationType>("office");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = () =>
    listWorkLocationsAction(false)
      .then(setLocations)
      .catch((err) => setError(err instanceof Error ? err.message : "Load failed"));

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <Header
        title="Work locations"
        subtitle="Offices and studios — starting with Ashok Nagar."
        actions={
          <Link href="/team">
            <Button size="sm" variant="outline">
              Team
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-3xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        <section className="space-y-2" data-testid="work-locations-list">
          {locations.map((l) => (
            <div
              key={l.id}
              className="rounded-xl border border-border bg-white/90 px-4 py-3 flex justify-between gap-3"
            >
              <div>
                <p className="font-medium text-deep-navy">{l.name}</p>
                <p className="text-xs text-charcoal/50">
                  {l.locationType} · {l.timezone} · {l.active ? "Active" : "Inactive"}
                </p>
              </div>
              <code className="text-xs text-charcoal/40">{l.code}</code>
            </div>
          ))}
        </section>

        <FormSection title="Add location">
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Code">
            <input
              className={inputClass}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ashok-nagar"
            />
          </Field>
          <Field label="Type">
            <select
              className={inputClass}
              value={locationType}
              onChange={(e) => setLocationType(e.target.value as WorkLocationType)}
            >
              {["office", "studio", "warehouse", "franchise", "partner", "other"].map(
                (t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Button
            type="button"
            disabled={pending || !name || !code}
            onClick={() => {
              start(async () => {
                await upsertWorkLocationAction({
                  code,
                  name,
                  locationType,
                });
                setName("");
                setCode("");
                await load();
              });
            }}
          >
            Save location
          </Button>
        </FormSection>

        <p className="text-xs text-charcoal/45">
          Future validation can include office IP, browser geolocation, device, QR, or camera
          evidence. GPS is optional — not required for v1 check-in.
        </p>
      </main>
    </>
  );
}

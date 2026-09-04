"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import {
  createManufactureVendorAction,
  listManufactureVendorsAction,
} from "@/app/actions/manufacture-actions";
import type { MfgVendorProfile } from "@/lib/domain/manufacture-types";

export default function ManufactureVendorsPage() {
  const [pending, startTransition] = useTransition();
  const [vendors, setVendors] = useState<MfgVendorProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [contact, setContact] = useState("");
  const [whatTheyMake, setWhatTheyMake] = useState("");
  const [howTheyWork, setHowTheyWork] = useState("");

  const load = () => {
    startTransition(async () => {
      const r = await listManufactureVendorsAction();
      if (!r.ok) setError(r.error);
      else setVendors(r.data);
    });
  };

  useEffect(() => {
    load();
  }, []);

  function create() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    startTransition(async () => {
      const r = await createManufactureVendorAction({
        name: name.trim(),
        contactPerson: contact,
        whatsappNumber: whatsapp,
        phone: whatsapp,
        whatTheyMake,
        howTheyWork,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setShowNew(false);
      setName("");
      window.location.href = `/manufacture/vendors/${encodeURIComponent(r.data.id)}`;
    });
  }

  return (
    <>
      <Header
        title="Vendors"
        subtitle="Who makes what for Aarla — terms, lead times, and how each vendor works."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/manufacture">
              <Button size="sm" variant="outline">
                Home
              </Button>
            </Link>
            <Button size="sm" onClick={() => setShowNew((s) => !s)}>
              Add vendor
            </Button>
          </div>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}

        {showNew ? (
          <section className="card-surface p-4 space-y-3">
            <h2 className="font-display text-lg text-deep-navy">New vendor</h2>
            <input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full max-w-md rounded-lg border border-border px-3 py-2 text-sm"
            />
            <input
              placeholder="Contact person"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-full max-w-md rounded-lg border border-border px-3 py-2 text-sm"
            />
            <input
              placeholder="WhatsApp number"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full max-w-md rounded-lg border border-border px-3 py-2 text-sm"
            />
            <input
              placeholder="What they make"
              value={whatTheyMake}
              onChange={(e) => setWhatTheyMake(e.target.value)}
              className="w-full max-w-md rounded-lg border border-border px-3 py-2 text-sm"
            />
            <textarea
              placeholder="How this vendor works (plain English)"
              value={howTheyWork}
              onChange={(e) => setHowTheyWork(e.target.value)}
              className="w-full max-w-xl min-h-[6rem] rounded-xl border border-border p-3 text-sm"
            />
            <Button onClick={create} disabled={pending}>
              {pending ? "Saving…" : "Save vendor"}
            </Button>
          </section>
        ) : null}

        <div className="space-y-3">
          {vendors.map((v) => (
            <Link
              key={v.id}
              href={`/manufacture/vendors/${encodeURIComponent(v.id)}`}
              className="card-surface p-4 block hover:border-aarla-red/30"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-medium text-deep-navy">{v.name}</p>
                <span className="text-xs text-charcoal/45">
                  {v.workflowTemplateId ? "Workflow saved" : "No workflow yet"}
                </span>
              </div>
              <p className="text-sm text-charcoal/65 mt-1">
                {v.whatTheyMake || v.category || "—"}
                {v.city ? ` · ${v.city}` : ""}
                {v.statedLeadTimeDays != null
                  ? ` · Says ${v.statedLeadTimeDays}d`
                  : v.leadTimeDays
                    ? ` · ${v.leadTimeDays}d lead`
                    : ""}
                {` · Buffer ${v.internalBufferDays}d`}
              </p>
            </Link>
          ))}
          {!pending && !vendors.length ? (
            <p className="text-sm text-charcoal/55">No vendors yet. Add your first manufacturer.</p>
          ) : null}
        </div>
      </main>
    </>
  );
}

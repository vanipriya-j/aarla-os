"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, selectClass } from "@/components/ui/FormSection";
import { StatusChip } from "@/components/ui/StatusChip";
import { useNetworkStore } from "@/lib/storage";
import {
  batches,
  partners,
  products,
} from "@/lib/domain";
import type { Interest, PurchaseSource } from "@/lib/domain";
import { Sparkles } from "lucide-react";

const sources: PurchaseSource[] = [
  "Website",
  "Studio",
  "Retail Partner",
  "Corporate Gift",
  "School",
  "Event",
  "Gift",
  "Other",
];

const interestOptions: Interest[] = [
  "Carnatic Music",
  "Bharatanatyam",
  "Festivals",
  "Temple Arts",
  "Chennai",
  "Children's Books",
  "Home & Living",
];

const incentives = [
  "Printable kolam activity sheet",
  "Early access to the next World drop",
  "Navarathri festival download",
  "Aarla Community invite",
];

export default function RegisterPage() {
  const { registerProduct } = useNetworkStore();
  const [done, setDone] = useState<{ name: string; incentive: string; code: string } | null>(null);
  const [form, setForm] = useState({
    registrationCode: "AARLA-KOL-NEW1",
    productId: "prod-kolam-bottle",
    name: "",
    email: "",
    phone: "",
    city: "",
    purchaseSource: "Website" as PurchaseSource,
    partnerId: "",
    purchasedByYou: true,
    gifted: false,
    interests: [] as Interest[],
    consent: false,
  });

  const batchId = batches.find((b) => b.productId === form.productId)?.id ?? batches[0].id;

  const toggleInterest = (i: Interest) => {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(i)
        ? prev.interests.filter((x) => x !== i)
        : [...prev.interests, i],
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.consent || !form.name || !form.email) return;
    const result = registerProduct({
      registrationCode: form.registrationCode,
      productId: form.productId,
      batchId,
      name: form.name,
      email: form.email,
      phone: form.phone,
      city: form.city,
      purchaseSource: form.purchaseSource,
      partnerId: form.partnerId || undefined,
      purchasedByYou: form.purchasedByYou,
      gifted: form.gifted,
      interests: form.interests,
    });
    const incentive = incentives[Math.floor(Math.random() * incentives.length)];
    setDone({
      name: result.user.name,
      incentive,
      code: result.registration.registrationCode,
    });
  };

  return (
    <>
      <Header title="Register Product" subtitle="A calm doorway into the Aarla community." />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 max-w-3xl">
        {done ? (
          <div className="card-surface p-8 md:p-10 text-center animate-fade-up">
            <Sparkles className="h-8 w-8 text-aarla-red mx-auto mb-4" />
            <h2 className="font-display text-3xl text-deep-navy">Welcome to the Aarla Community</h2>
            <p className="mt-3 text-charcoal/70 leading-relaxed">
              Thank you, {done.name}. Your object is now linked — from batch to you.
            </p>
            <div className="mt-5 flex justify-center gap-2 flex-wrap">
              <StatusChip label={done.code} tone="info" />
              <StatusChip label="Community Member" tone="success" />
            </div>
            <div className="mt-8 rounded-2xl bg-pale-cream border border-border p-5 text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-aarla-red">
                A small gift for you
              </p>
              <p className="font-display text-xl text-deep-navy mt-2">{done.incentive}</p>
              <p className="text-sm text-charcoal/60 mt-1">Mock incentive for this prototype.</p>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/registrations">
                <Button>View registrations</Button>
              </Link>
              <Link href={`/products/${form.productId}`}>
                <Button variant="outline">See product journey</Button>
              </Link>
              <Button variant="ghost" onClick={() => setDone(null)}>
                Register another
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-up">
            <div className="card-surface p-8 md:p-10 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-aarla-red">
                Product registration
              </p>
              <h2 className="font-display text-3xl md:text-4xl text-deep-navy mt-3 leading-tight">
                Tell us where your Aarla story reached.
              </h2>
              <p className="mt-4 text-charcoal/65 leading-relaxed max-w-xl mx-auto">
                Every Aarla object carries a story. Register yours and become part of the Aarla
                community.
              </p>
            </div>

            <form onSubmit={submit} className="card-surface p-6 md:p-8 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Registration Code">
                  <input
                    className={inputClass}
                    value={form.registrationCode}
                    onChange={(e) => setForm({ ...form, registrationCode: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Product">
                  <select
                    className={selectClass}
                    value={form.productId}
                    onChange={(e) => setForm({ ...form, productId: e.target.value })}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Name">
                  <input
                    className={inputClass}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Email">
                  <input
                    className={inputClass}
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className={inputClass}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
                <Field label="City">
                  <input
                    className={inputClass}
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </Field>
                <Field label="Purchase Source">
                  <select
                    className={selectClass}
                    value={form.purchaseSource}
                    onChange={(e) =>
                      setForm({ ...form, purchaseSource: e.target.value as PurchaseSource })
                    }
                  >
                    {sources.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Partner (if any)">
                  <select
                    className={selectClass}
                    value={form.partnerId}
                    onChange={(e) => setForm({ ...form, partnerId: e.target.value })}
                  >
                    <option value="">None</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.purchasedByYou}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        purchasedByYou: e.target.checked,
                        gifted: e.target.checked ? false : form.gifted,
                      })
                    }
                  />
                  Purchased by you?
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.gifted}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        gifted: e.target.checked,
                        purchasedByYou: e.target.checked ? false : form.purchasedByYou,
                      })
                    }
                  />
                  Gifted?
                </label>
              </div>

              <div>
                <p className="text-sm font-medium text-deep-navy mb-2">Interests</p>
                <div className="flex flex-wrap gap-2">
                  {interestOptions.map((i) => {
                    const on = form.interests.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleInterest(i)}
                        className={`text-xs rounded-full px-3 py-1.5 border ${
                          on
                            ? "bg-aarla-red text-white border-aarla-red"
                            : "border-border text-charcoal/70"
                        }`}
                      >
                        {i}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-start gap-3 text-sm text-charcoal/75">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.consent}
                  onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                  required
                />
                I consent to joining the Aarla community and receiving thoughtful updates about
                Worlds, objects and gatherings.
              </label>

              <Button type="submit" size="lg" disabled={!form.consent}>
                Register Product
              </Button>
            </form>
          </div>
        )}
      </main>
    </>
  );
}

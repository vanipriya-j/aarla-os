"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { useNetworkStore } from "@/lib/storage";
import { getProductTitle } from "@/lib/network-data";
import { ArrowLeft } from "lucide-react";

export default function PersonDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { people, registrations, hydrated } = useNetworkStore();
  const person = people.find((p) => p.id === id);

  if (hydrated && !person) {
    return (
      <>
        <Header title="Person not found" />
        <main className="px-8 py-8">
          <Link href="/people">
            <Button variant="outline">Back to People</Button>
          </Link>
        </main>
      </>
    );
  }

  if (!person) {
    return <Header title="People" subtitle="Loading…" />;
  }

  const regs = registrations.filter((r) => r.userId === person.id || r.customerId === person.id);

  return (
    <>
      <Header
        title={person.name}
        subtitle={`${person.city} · ${person.email}`}
        actions={
          <Link href="/people">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              All people
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-5xl">
        <section className="card-surface p-5">
          <h2 className="font-display text-xl text-deep-navy mb-3">Contact</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <p>
              <span className="text-charcoal/50">Email</span>
              <br />
              {person.email}
            </p>
            <p>
              <span className="text-charcoal/50">Phone</span>
              <br />
              {person.phone || "—"}
            </p>
            <p>
              <span className="text-charcoal/50">City</span>
              <br />
              {person.city}
            </p>
            <p>
              <span className="text-charcoal/50">Since</span>
              <br />
              {person.createdAt}
            </p>
          </div>
        </section>

        <section className="card-surface p-5">
          <h2 className="font-display text-xl text-deep-navy mb-3">Roles</h2>
          <div className="flex flex-wrap gap-2">
            {person.roles.map((r) => (
              <StatusChip key={r} label={r} tone="info" />
            ))}
          </div>
          <p className="mt-3 text-sm text-charcoal/65 leading-relaxed">
            Customer places the order. User owns or uses the object. Community begins after
            registration.
          </p>
        </section>

        <div className="grid lg:grid-cols-3 gap-4">
          <section className="card-surface p-5">
            <h2 className="font-display text-lg text-deep-navy mb-3">Products Purchased</h2>
            <ul className="space-y-2 text-sm">
              {person.purchasedOrders.length ? (
                person.purchasedOrders.map((o) => (
                  <li key={o} className="border-l-2 border-soft-beige pl-3">
                    Order {o}
                  </li>
                ))
              ) : (
                <li className="text-charcoal/50">No purchases on record</li>
              )}
            </ul>
          </section>
          <section className="card-surface p-5">
            <h2 className="font-display text-lg text-deep-navy mb-3">Products Owned</h2>
            <ul className="space-y-2 text-sm">
              {person.ownedProducts.length ? (
                person.ownedProducts.map((pid) => (
                  <li key={pid}>
                    <Link href={`/products/${pid}`} className="text-deep-navy hover:text-aarla-red">
                      {getProductTitle(pid)}
                    </Link>
                  </li>
                ))
              ) : (
                <li className="text-charcoal/50">No owned products yet</li>
              )}
            </ul>
          </section>
          <section className="card-surface p-5">
            <h2 className="font-display text-lg text-deep-navy mb-3">Products Registered</h2>
            <ul className="space-y-2 text-sm">
              {regs.length ? (
                regs.map((r) => (
                  <li key={r.registrationId}>
                    <Link
                      href={`/products/${r.productId}`}
                      className="text-deep-navy hover:text-aarla-red"
                    >
                      {getProductTitle(r.productId)}
                    </Link>
                    <span className="text-charcoal/50"> · {r.registrationDate}</span>
                  </li>
                ))
              ) : (
                <li className="text-charcoal/50">Not yet registered</li>
              )}
            </ul>
          </section>
        </div>

        <section className="card-surface p-5">
          <h2 className="font-display text-xl text-deep-navy mb-3">Interests</h2>
          <div className="flex flex-wrap gap-2">
            {person.interests.length ? (
              person.interests.map((i) => <StatusChip key={i} label={i} />)
            ) : (
              <p className="text-sm text-charcoal/50">No interests captured</p>
            )}
          </div>
        </section>

        <section className="card-surface p-5">
          <h2 className="font-display text-xl text-deep-navy mb-4">Timeline</h2>
          <ol className="space-y-3">
            {(person.timeline ?? []).map((t, i) => (
              <li key={`${t.date}-${i}`} className="flex gap-4 text-sm">
                <span className="text-charcoal/45 w-24 shrink-0">{t.date}</span>
                {t.href ? (
                  <Link href={t.href} className="text-deep-navy hover:text-aarla-red">
                    {t.label}
                  </Link>
                ) : (
                  <span className="text-deep-navy">{t.label}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}

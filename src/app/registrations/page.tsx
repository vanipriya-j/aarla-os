"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { useNetworkStore } from "@/lib/storage";
import {
  getPartnerName,
  getPersonName,
  getProductTitle,
  products,
  organizations,
  partners,
} from "@/lib/domain";
import { MapPin, Package, Percent, ScanLine, Store, Users } from "lucide-react";

export default function RegistrationsPage() {
  const { people, registrations, hydrated } = useNetworkStore();

  const registeredUsers = new Set(registrations.map((r) => r.userId)).size;
  const productsRegistered = new Set(registrations.map((r) => r.productId)).size;
  const soldProxy = 500 + 20 + 15;
  const regRate = Math.round((registrations.length / soldProxy) * 1000) / 10;

  const cityCounts = people.reduce<Record<string, number>>((acc, p) => {
    if (p.roles.includes("User") || p.roles.includes("Community Member")) {
      acc[p.city] = (acc[p.city] ?? 0) + 1;
    }
    return acc;
  }, {});
  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const productCounts = registrations.reduce<Record<string, number>>((acc, r) => {
    acc[r.productId] = (acc[r.productId] ?? 0) + 1;
    return acc;
  }, {});
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const partnerCounts = partners
    .map((p) => ({
      name: p.name,
      count: registrations.filter((r) => r.partnerId === p.id).length,
    }))
    .sort((a, b) => b.count - a.count);

  const infosysUnknown = 500 - (organizations.find((o) => o.id === "org-infosys")?.usersReached ?? 0);

  return (
    <>
      <Header
        title="Registrations"
        subtitle="Where products meet known users — and where circulation remains unknown."
        actions={
          <Link href="/register">
            <Button size="sm">Register Product</Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        <section className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <SummaryCard
            label="Products Registered"
            value={hydrated ? String(registrations.length) : "—"}
            icon={ScanLine}
            accent="navy"
          />
          <SummaryCard label="Registered Users" value={String(registeredUsers)} icon={Users} accent="green" />
          <SummaryCard
            label="Registration %"
            value={`${regRate}%`}
            hint="Of tracked sold / allocated units"
            icon={Percent}
            accent="orange"
          />
          <SummaryCard
            label="Top Cities"
            value={topCities[0]?.[0] ?? "—"}
            hint={topCities.map(([c, n]) => `${c} (${n})`).join(" · ")}
            icon={MapPin}
          />
          <SummaryCard
            label="Top Products"
            value={topProducts[0] ? getProductTitle(topProducts[0][0]) : "—"}
            hint={topProducts.map(([id, n]) => `${getProductTitle(id)} (${n})`).join(" · ")}
            icon={Package}
          />
          <SummaryCard
            label="Top Partners"
            value={partnerCounts[0]?.name ?? "—"}
            hint={partnerCounts.map((p) => `${p.name} (${p.count})`).join(" · ")}
            icon={Store}
          />
        </section>

        <div className="card-surface p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-xl text-deep-navy">Attention</p>
            <p className="text-sm text-charcoal/65 mt-1">
              Infosys Welcome Kits: {infosysUnknown} still{" "}
              <strong>In Circulation – User Unknown</strong>.{" "}
              <Link href="/products/np-welcome-kit" className="text-aarla-red">
                View journey →
              </Link>
            </p>
          </div>
          <StatusChip label={`${productsRegistered} SKUs touched`} tone="info" />
        </div>

        <div>
          <h2 className="font-display text-xl text-deep-navy mb-3">Recent registrations</h2>
          <DataTable
            rows={[...registrations].sort((a, b) =>
              b.registrationDate.localeCompare(a.registrationDate),
            )}
            rowKey={(r) => r.registrationId}
            columns={[
              { key: "date", header: "Date", render: (r) => r.registrationDate },
              {
                key: "product",
                header: "Product",
                render: (r) => (
                  <Link href={`/products/${r.productId}`} className="font-medium text-deep-navy hover:text-aarla-red">
                    {getProductTitle(r.productId)}
                  </Link>
                ),
              },
              {
                key: "customer",
                header: "Customer",
                render: (r) =>
                  r.customerId ? (
                    <Link href={`/people/${r.customerId}`}>{getPersonName(r.customerId)}</Link>
                  ) : r.organizationId ? (
                    "Infosys"
                  ) : (
                    "—"
                  ),
              },
              {
                key: "user",
                header: "User",
                render: (r) => (
                  <Link href={`/people/${r.userId}`} className="hover:text-aarla-red">
                    {getPersonName(r.userId)}
                  </Link>
                ),
              },
              {
                key: "partner",
                header: "Partner",
                render: (r) => (r.partnerId ? getPartnerName(r.partnerId) : "—"),
              },
              { key: "source", header: "Source", render: (r) => r.purchaseSource },
              {
                key: "status",
                header: "Status",
                render: (r) => <StatusChip label={r.status} tone="success" />,
              },
            ]}
          />
        </div>

        <p className="text-xs text-charcoal/45">
          Network catalog: {products.map((p) => p.title).join(" · ")}
        </p>
      </main>
    </>
  );
}

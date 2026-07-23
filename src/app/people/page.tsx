"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { useNetworkStore } from "@/lib/storage";
import { getProductTitle } from "@/lib/network-data";
import { Users } from "lucide-react";

type Filter = "all" | "customers" | "users" | "both" | "community";

function PeopleInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initial = (searchParams.get("filter") as Filter) || "all";
  const [filter, setFilter] = useState<Filter>(initial);
  const { people, registrations, hydrated } = useNetworkStore();

  const filtered = useMemo(() => {
    return people.filter((p) => {
      const isCustomer = p.roles.includes("Customer");
      const isUser = p.roles.includes("User");
      const isCommunity = p.roles.includes("Community Member");
      if (filter === "customers") return isCustomer;
      if (filter === "users") return isUser;
      if (filter === "both") return isCustomer && isUser;
      if (filter === "community") return isCommunity;
      return true;
    });
  }, [people, filter]);

  const customers = people.filter((p) => p.roles.includes("Customer")).length;
  const users = people.filter((p) => p.roles.includes("User")).length;
  const community = people.filter((p) => p.roles.includes("Community Member")).length;

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "customers", label: "Customers" },
    { id: "users", label: "Users" },
    { id: "both", label: "Both" },
    { id: "community", label: "Community" },
  ];

  return (
    <>
      <Header
        title="People"
        subtitle="Customers pay. Users own. Community begins at registration."
        actions={
          <Link href="/register">
            <Button size="sm">Register a product</Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <SummaryCard
            label="Total People"
            value={hydrated ? String(people.length) : "—"}
            icon={Users}
          />
          <SummaryCard label="Customers" value={String(customers)} accent="navy" />
          <SummaryCard label="Users" value={String(users)} accent="orange" />
          <SummaryCard label="Community Members" value={String(community)} accent="green" />
        </section>

        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`text-sm rounded-full px-3 py-1.5 border transition ${
                filter === f.id
                  ? "bg-aarla-red text-white border-aarla-red"
                  : "border-border bg-white text-charcoal/70 hover:border-aarla-red/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <DataTable
          rows={filtered}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/people/${r.id}`)}
          columns={[
            {
              key: "name",
              header: "Name",
              render: (r) => (
                <Link
                  href={`/people/${r.id}`}
                  className="font-medium text-deep-navy hover:text-aarla-red"
                >
                  {r.name}
                </Link>
              ),
            },
            {
              key: "roles",
              header: "Roles",
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.roles.map((role) => (
                    <StatusChip
                      key={role}
                      label={role}
                      tone={
                        role === "Community Member"
                          ? "success"
                          : role === "Customer"
                            ? "info"
                            : "accent"
                      }
                    />
                  ))}
                </div>
              ),
            },
            { key: "city", header: "City", render: (r) => r.city },
            {
              key: "owned",
              header: "Products Owned",
              render: (r) =>
                r.ownedProducts.length ? r.ownedProducts.map(getProductTitle).join(", ") : "—",
            },
            {
              key: "orders",
              header: "Orders",
              render: (r) => String(r.purchasedOrders.length),
            },
            {
              key: "regs",
              header: "Registrations",
              render: (r) =>
                String(
                  registrations.filter((reg) => reg.userId === r.id || reg.customerId === r.id)
                    .length,
                ),
            },
          ]}
        />
      </main>
    </>
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<Header title="People" subtitle="Loading…" />}>
      <PeopleInner />
    </Suspense>
  );
}

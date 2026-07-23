import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import {
  channelMix,
  dashboardMetrics,
  launchChecklists,
  products,
  purchaseOrders,
  revenueByMonth,
} from "@/lib/mock-data";
import {
  batches,
  getInventorySnapshots,
  networkProducts,
  partners,
  peopleSeed,
  registrationsSeed,
} from "@/lib/network-data";
import {
  IndianRupee,
  Package,
  Percent,
  ScanLine,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function DashboardPage() {
  const maxRevenue = Math.max(...revenueByMonth.map((m) => m.revenue));
  const fast = products.filter((p) => p.velocity === "Fast");
  const slow = products.filter((p) => p.velocity === "Slow");
  const pendingMfg = purchaseOrders.filter((p) =>
    ["Sent", "In Production", "Shipped", "Partial"].includes(p.status),
  );

  const customers = peopleSeed.filter((p) => p.roles.includes("Customer")).length;
  const users = peopleSeed.filter((p) => p.roles.includes("User")).length;
  const registeredProducts = registrationsSeed.length;
  const inCirculationUnknown = 482;
  const partnerInventory = partners.reduce(
    (sum, p) => sum + p.currentInventory.reduce((s, i) => s + i.quantity, 0),
    0,
  );
  const topPartner = [...partners].sort(
    (a, b) => b.registeredUsersOriginatingHere - a.registeredUsersOriginatingHere,
  )[0];
  const topNetworkProduct = [...networkProducts].sort(
    (a, b) => b.registrations - a.registrations,
  )[0];
  const regRate = Math.round((registeredProducts / (500 + 30)) * 1000) / 10;
  const damagedBatches = batches.filter((b) => b.damaged > 0);
  const snapshots = getInventorySnapshots();

  return (
    <>
      <Header
        title="Business Dashboard"
        subtitle="Revenue, capital, movement — and the journey from customer to community."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <SummaryCard
            label="Revenue"
            value={formatINR(dashboardMetrics.revenue)}
            hint={`+${dashboardMetrics.revenueChange}% vs prior period`}
            icon={IndianRupee}
            accent="navy"
          />
          <SummaryCard
            label="Orders"
            value={String(dashboardMetrics.orders)}
            hint={`+${dashboardMetrics.ordersChange}% · AOV ${formatINR(dashboardMetrics.aov)}`}
            icon={ShoppingBag}
            accent="orange"
          />
          <SummaryCard
            label="Gross margin"
            value={`${dashboardMetrics.grossMargin}%`}
            hint="Across active SKUs"
            icon={Percent}
            accent="green"
          />
          <SummaryCard
            label="Capital blocked in inventory"
            value={formatINR(dashboardMetrics.capitalBlocked)}
            hint={`Receivables ${formatINR(dashboardMetrics.outstandingReceivables)}`}
            icon={Wallet}
            accent="red"
          />
        </section>

        <section>
          <h2 className="font-display text-xl text-deep-navy mb-3">Product network</h2>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard label="Customers" value={String(customers)} icon={Users} accent="navy" />
            <SummaryCard label="Users" value={String(users)} icon={Users} accent="orange" />
            <SummaryCard
              label="In Circulation – User Unknown"
              value={String(inCirculationUnknown)}
              hint="Mostly Infosys welcome kits"
              icon={Package}
              accent="red"
            />
            <SummaryCard
              label="Registered Products"
              value={String(registeredProducts)}
              hint={`Registration rate ${regRate}%`}
              icon={ScanLine}
              accent="green"
            />
            <SummaryCard
              label="Partner Inventory"
              value={String(partnerInventory)}
              icon={Store}
            />
            <SummaryCard
              label="Top Partner"
              value={topPartner?.name ?? "—"}
              hint={`${topPartner?.registeredUsersOriginatingHere ?? 0} registrations`}
            />
            <SummaryCard
              label="Top Product"
              value={topNetworkProduct?.title ?? "—"}
            >
              <Link
                href={`/products/${topNetworkProduct?.id ?? "np-kolam"}`}
                className="inline-block mt-2 text-sm text-aarla-red font-medium"
              >
                Open journey →
              </Link>
            </SummaryCard>
            <SummaryCard
              label="Registration Rate"
              value={`${regRate}%`}
              hint="Known users / allocated units"
              icon={Percent}
              accent="green"
            />
          </div>
        </section>

        <section className="card-surface p-5">
          <h2 className="font-display text-xl text-deep-navy mb-3">Attention items</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-3 border-b border-border pb-2">
              <span>
                Products sold but not registered —{" "}
                <Link href="/products/np-welcome-kit" className="text-aarla-red">
                  Welcome Kit
                </Link>
              </span>
              <StatusChip label={`${inCirculationUnknown} unknown`} tone="warning" />
            </li>
            <li className="flex justify-between gap-3 border-b border-border pb-2">
              <span>Low registration rate on corporate allocation</span>
              <StatusChip label={`${regRate}%`} tone="danger" />
            </li>
            <li className="flex justify-between gap-3 border-b border-border pb-2">
              <span>
                Partner inventory not updated —{" "}
                <Link href="/partners" className="text-aarla-red">
                  Nimalli photos pending
                </Link>
              </span>
              <StatusChip label="Review" tone="warning" />
            </li>
            <li className="flex justify-between gap-3">
              <span>
                Damaged batches —{" "}
                {damagedBatches.map((b) => b.batchNumber).join(", ") || "None"}
              </span>
              <StatusChip
                label={`${snapshots.reduce((s, x) => s + x.damaged, 0)} units`}
                tone="danger"
              />
            </li>
          </ul>
        </section>

        <section className="grid lg:grid-cols-3 gap-4">
          <div className="card-surface p-5 lg:col-span-2">
            <h2 className="font-display text-xl text-deep-navy mb-4">Revenue by month</h2>
            <div className="flex items-end gap-3 h-48">
              {revenueByMonth.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-[10px] text-charcoal/50">{Math.round(m.revenue / 1000)}k</span>
                  <div
                    className="w-full rounded-t-md bg-deep-navy/85 hover:bg-aarla-red transition-colors"
                    style={{ height: `${(m.revenue / maxRevenue) * 100}%` }}
                    title={formatINR(m.revenue)}
                  />
                  <span className="text-xs text-charcoal/60">{m.month}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card-surface p-5">
            <h2 className="font-display text-xl text-deep-navy mb-4">Top channels</h2>
            <ul className="space-y-3">
              {channelMix.map((c) => (
                <li key={c.channel}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-deep-navy font-medium">{c.channel}</span>
                    <span className="text-charcoal/55">{c.share}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-soft-beige overflow-hidden">
                    <div
                      className="h-full rounded-full bg-mustard"
                      style={{ width: `${c.share}%` }}
                    />
                  </div>
                  <p className="text-xs text-charcoal/50 mt-1">{formatINR(c.revenue)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-4">
          <div className="card-surface p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-muted-green" />
              <h2 className="font-display text-xl text-deep-navy">Fast-moving products</h2>
            </div>
            <ul className="space-y-3">
              {fast.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-deep-navy">{p.name}</p>
                    <p className="text-xs text-charcoal/55">
                      Stock {p.inventory} · Margin{" "}
                      {(((p.sellingPrice - p.cost) / p.sellingPrice) * 100).toFixed(0)}%
                    </p>
                  </div>
                  <StatusChip label="Fast" tone="success" />
                </li>
              ))}
            </ul>
          </div>
          <div className="card-surface p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="h-4 w-4 text-warm-orange" />
              <h2 className="font-display text-xl text-deep-navy">Slow-moving products</h2>
            </div>
            <ul className="space-y-3">
              {slow.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-deep-navy">{p.name}</p>
                    <p className="text-xs text-charcoal/55">
                      Stock {p.inventory} · Cost locked {formatINR(p.cost * p.inventory)}
                    </p>
                  </div>
                  <StatusChip label="Slow" tone="warning" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-4">
          <div>
            <h2 className="font-display text-xl text-deep-navy mb-3">Pending manufacturing</h2>
            <DataTable
              rows={pendingMfg}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: "id",
                  header: "PO",
                  render: (r) => <span className="font-medium text-deep-navy">{r.id}</span>,
                },
                {
                  key: "product",
                  header: "Product",
                  render: (r) => <span className="line-clamp-1 max-w-[180px]">{r.productName}</span>,
                },
                {
                  key: "status",
                  header: "Status",
                  render: (r) => (
                    <StatusChip label={r.status} tone={statusToneFromLabel(r.status)} />
                  ),
                },
                { key: "due", header: "Due", render: (r) => r.requiredDate },
              ]}
            />
          </div>
          <div className="space-y-4">
            <div className="card-surface p-5">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-aarla-red" />
                <h2 className="font-display text-xl text-deep-navy">Outstanding receivables</h2>
              </div>
              <p className="font-display text-3xl text-deep-navy">
                {formatINR(dashboardMetrics.outstandingReceivables)}
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex justify-between border-b border-border pb-2">
                  <span>Kumon Learning Centre</span>
                  <span className="font-medium">{formatINR(14800)}</span>
                </li>
                <li className="flex justify-between border-b border-border pb-2">
                  <span>Chalanam Festival Org</span>
                  <span className="font-medium">{formatINR(22000)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Pop-up partner — Besant Nagar</span>
                  <span className="font-medium">{formatINR(11800)}</span>
                </li>
              </ul>
            </div>
            <div className="card-surface p-5">
              <h2 className="font-display text-xl text-deep-navy mb-3">Upcoming launches</h2>
              <ul className="space-y-2">
                {launchChecklists.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-deep-navy font-medium">{l.productName}</span>
                    <StatusChip label={l.launchDate} tone="info" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

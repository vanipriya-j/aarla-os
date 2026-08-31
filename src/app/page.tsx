import Link from "next/link";
import { connection } from "next/server";
import { Header } from "@/components/layout/Header";
import { AskAarla } from "@/components/home/AskAarla";
import { TaskTile } from "@/components/ui/TaskTile";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { operateNav, createNav, adminNav } from "@/lib/navigation";
import { getHomeDashboardData } from "@/lib/application/services";
import type { AttentionItem, ContentTask, DashboardMetrics, PriorityItem, Project, ShopifyOrder } from "@/lib/types";
import type { PurchaseOrder } from "@/lib/domain/types";
import { AlertTriangle, IndianRupee, Package, Sparkles } from "lucide-react";

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function HomePage() {
  // Home reads Postgres — must not be prerendered at build time.
  await connection();

  let metrics: DashboardMetrics = {
    revenue: 0,
    revenueChange: 0,
    orders: 0,
    ordersChange: 0,
    aov: 0,
    grossMargin: 0,
    capitalBlocked: 0,
    outstandingReceivables: 0,
  };
  let priorities: PriorityItem[] = [];
  let attentionItems: AttentionItem[] = [];
  let channelOrders: ShopifyOrder[] = [];
  let contentTasks: ContentTask[] = [];
  let projects: Project[] = [];
  let purchaseOrders: PurchaseOrder[] = [];
  let tipPrompts: string[] = [];
  let productTitles = new Map<string, string>();
  let loadError: string | null = null;

  try {
    const data = await getHomeDashboardData();
    metrics = (data.metrics.dashboard as DashboardMetrics) ?? metrics;
    priorities = data.priorities as PriorityItem[];
    attentionItems = data.attention as AttentionItem[];
    channelOrders = data.channelOrders as ShopifyOrder[];
    contentTasks = data.contentTasks as ContentTask[];
    projects = data.projects as Project[];
    purchaseOrders = data.purchaseOrders;
    tipPrompts = data.tipPrompts;
    productTitles = new Map(data.products.map((p) => [p.id, p.title]));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const pendingOrders = channelOrders.filter((o) => o.courierStatus === "Awaiting Pack");
  const mfgUpdates = purchaseOrders.filter((p) =>
    ["In Production", "Shipped", "Partial"].includes(p.status),
  );
  const openContent = contentTasks.filter((c) => c.status !== "Published");
  const recentProjects = projects.slice(0, 4);
  const productTitle = (id: string) => productTitles.get(id) ?? id;

  return (
    <>
      <Header
        title="What would you like to do today?"
        subtitle="Your calm operating surface for ideas, making, launch and care."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 space-y-8 pb-16">
        {loadError ? (
          <p className="text-sm text-aarla-red rounded-xl border border-aarla-red/30 bg-white px-4 py-3">
            Database unavailable: {loadError}
          </p>
        ) : null}
        <AskAarla tipPrompts={tipPrompts} />

        <section>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="font-display text-2xl text-deep-navy">Operate</h2>
              <p className="text-sm text-charcoal/60 mt-1">
                This week’s loop — fulfil, calls, stock, make, campaigns.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {operateNav.map((tile, i) => (
              <TaskTile
                key={tile.href}
                label={tile.label}
                description={tile.description}
                href={tile.href}
                icon={tile.icon}
                index={i}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="font-display text-2xl text-deep-navy">Create</h2>
            <p className="text-sm text-charcoal/60 mt-1">
              Ideas, stories, content, projects and launches.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {createNav.map((tile, i) => (
              <TaskTile
                key={tile.href}
                label={tile.label}
                description={tile.description}
                href={tile.href}
                icon={tile.icon}
                index={i}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="font-display text-2xl text-deep-navy">Admin</h2>
            <p className="text-sm text-charcoal/60 mt-1">
              Dashboard, GST, master data and system wiring.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {adminNav.map((tile, i) => (
              <TaskTile
                key={tile.href}
                label={tile.label}
                description={tile.description}
                href={tile.href}
                icon={tile.icon}
                index={i}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-charcoal/60">
            Signature journey:{" "}
            <Link href="/products/prod-kolam-bottle" className="text-aarla-red font-medium">
              Kolam Bottle →
            </Link>
          </p>
        </section>

        <section className="grid lg:grid-cols-3 gap-4">
          <SummaryCard
            label="Revenue (YTD)"
            value={formatINR(metrics.revenue)}
            hint={`+${metrics.revenueChange}% vs last period`}
            icon={IndianRupee}
            accent="navy"
          />
          <SummaryCard
            label="Orders awaiting pack"
            value={String(pendingOrders.length)}
            hint="Shopify + institutional"
            icon={Package}
            accent="orange"
          />
          <SummaryCard
            label="Items needing attention"
            value={String(attentionItems.length)}
            hint="Stock, payments, launch blockers"
            icon={AlertTriangle}
            accent="red"
          />
        </section>

        <section className="grid lg:grid-cols-2 gap-4">
          <div className="card-surface p-5 animate-fade-up">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-aarla-red" />
              <h2 className="font-display text-xl text-deep-navy">Today&apos;s priorities</h2>
            </div>
            <ul className="space-y-3">
              {priorities.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-pale-cream/70 px-4 py-3 hover:border-aarla-red/35 transition"
                  >
                    <div>
                      <p className="text-sm font-medium text-deep-navy">{item.title}</p>
                      <p className="text-xs text-charcoal/55 mt-1">{item.source}</p>
                    </div>
                    <StatusChip
                      label={item.urgency}
                      tone={item.urgency === "High" ? "danger" : "warning"}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="card-surface p-5 animate-fade-up">
            <h2 className="font-display text-xl text-deep-navy mb-4">Items needing attention</h2>
            <ul className="space-y-3">
              {attentionItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="block rounded-xl border border-border px-4 py-3 hover:bg-pale-cream transition"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-deep-navy">{item.title}</p>
                      <StatusChip label="Review" tone={item.tone} />
                    </div>
                    <p className="text-xs text-charcoal/60">{item.detail}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="card-surface p-5">
            <h2 className="font-display text-lg text-deep-navy mb-3">Recently opened projects</h2>
            <ul className="space-y-2">
              {recentProjects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-pale-cream"
                  >
                    <span className="text-sm text-deep-navy font-medium truncate">{p.name}</span>
                    <StatusChip label={p.status} tone={statusToneFromLabel(p.status)} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="card-surface p-5">
            <h2 className="font-display text-lg text-deep-navy mb-3">Pending orders</h2>
            <ul className="space-y-2">
              {pendingOrders.map((o) => (
                <li key={o.id} className="rounded-lg px-2 py-2 border-b border-border last:border-0">
                  <p className="text-sm font-medium text-deep-navy">{o.id}</p>
                  <p className="text-xs text-charcoal/60">
                    {o.customer} · {o.deliveryCity}
                  </p>
                </li>
              ))}
            </ul>
            <Link href="/fulfil" className="inline-block mt-3 text-sm text-aarla-red font-medium">
              Open fulfil →
            </Link>
          </div>

          <div className="card-surface p-5">
            <h2 className="font-display text-lg text-deep-navy mb-3">Manufacturing updates</h2>
            <ul className="space-y-2">
              {mfgUpdates.map((po) => (
                <li key={po.id} className="flex items-start justify-between gap-2 py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-deep-navy">{po.id}</p>
                    <p className="text-xs text-charcoal/60 truncate max-w-[160px]">
                      {productTitle(po.productId)}
                    </p>
                  </div>
                  <StatusChip label={po.status} tone={statusToneFromLabel(po.status)} />
                </li>
              ))}
            </ul>
          </div>

          <div className="card-surface p-5">
            <h2 className="font-display text-lg text-deep-navy mb-3">Content tasks</h2>
            <ul className="space-y-2">
              {openContent.slice(0, 4).map((c) => (
                <li key={c.id} className="py-2 border-b border-border last:border-0">
                  <p className="text-sm font-medium text-deep-navy line-clamp-1">{c.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusChip label={c.status} tone={statusToneFromLabel(c.status)} />
                    <span className="text-xs text-charcoal/50">Due {c.dueDate}</span>
                  </div>
                </li>
              ))}
            </ul>
            <Link href="/content" className="inline-block mt-3 text-sm text-aarla-red font-medium">
              Open studio →
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { contentTasks, projects } from "@/lib/mock-data";
import { ArrowLeft } from "lucide-react";

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function generateStaticParams() {
  return projects.map((p) => ({ id: p.id }));
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = projects.find((p) => p.id === id);
  if (!project) notFound();

  const linkedContent = contentTasks.filter((c) => project.contentTasks.includes(c.id));

  return (
    <>
      <Header
        title={project.name}
        subtitle={project.notes}
        actions={
          <Link href="/projects">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              All projects
            </Button>
          </Link>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-5xl">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-surface p-4">
            <p className="text-xs text-charcoal/45 uppercase tracking-wider">Status</p>
            <div className="mt-2">
              <StatusChip label={project.status} tone={statusToneFromLabel(project.status)} />
            </div>
          </div>
          <div className="card-surface p-4">
            <p className="text-xs text-charcoal/45 uppercase tracking-wider">Deadline</p>
            <p className="mt-2 font-display text-xl text-deep-navy">{project.deadline}</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-xs text-charcoal/45 uppercase tracking-wider">Budget</p>
            <p className="mt-2 font-display text-xl text-deep-navy">{formatINR(project.budget)}</p>
          </div>
          <div className="card-surface p-4">
            <p className="text-xs text-charcoal/45 uppercase tracking-wider">Capital committed</p>
            <p className="mt-2 font-display text-xl text-aarla-red">
              {formatINR(project.capitalCommitted)}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <section className="card-surface p-5">
            <h2 className="font-display text-xl text-deep-navy mb-3">Linked products</h2>
            <ul className="space-y-2">
              {project.linkedProducts.map((p) => (
                <li key={p} className="text-sm text-charcoal/80 border-l-2 border-soft-beige pl-3">
                  {p}
                </li>
              ))}
            </ul>
          </section>
          <section className="card-surface p-5">
            <h2 className="font-display text-xl text-deep-navy mb-3">Vendors</h2>
            <div className="flex flex-wrap gap-2">
              {project.vendors.map((v) => (
                <StatusChip key={v} label={v} tone="info" />
              ))}
            </div>
            <h3 className="font-display text-lg text-deep-navy mt-5 mb-2">Manufacturing orders</h3>
            {project.manufacturingOrders.length ? (
              <div className="flex flex-wrap gap-2">
                {project.manufacturingOrders.map((m) => (
                  <Link key={m} href="/manufacture">
                    <StatusChip label={m} tone="accent" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-charcoal/55">No manufacturing orders linked yet.</p>
            )}
          </section>
        </div>

        <section className="card-surface p-5">
          <h2 className="font-display text-xl text-deep-navy mb-3">Tasks</h2>
          <ul className="space-y-2">
            {project.tasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
              >
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" defaultChecked={t.done} readOnly />
                  <span className={t.done ? "text-charcoal/45 line-through" : "text-deep-navy"}>
                    {t.title}
                  </span>
                </label>
                {t.due ? <span className="text-xs text-charcoal/50">Due {t.due}</span> : null}
              </li>
            ))}
          </ul>
        </section>

        <div className="grid lg:grid-cols-2 gap-4">
          <section className="card-surface p-5">
            <h2 className="font-display text-xl text-deep-navy mb-3">Content tasks</h2>
            {linkedContent.length ? (
              <ul className="space-y-2">
                {linkedContent.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href="/content" className="text-deep-navy hover:text-aarla-red">
                      {c.title}
                    </Link>
                    <StatusChip label={c.status} tone={statusToneFromLabel(c.status)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-charcoal/55">No content tasks linked.</p>
            )}
          </section>
          <section className="card-surface p-5">
            <h2 className="font-display text-xl text-deep-navy mb-3">Risks</h2>
            <ul className="space-y-2">
              {project.risks.map((r) => (
                <li key={r} className="text-sm text-charcoal/80 rounded-xl bg-mustard/15 border border-mustard/30 px-3 py-2">
                  {r}
                </li>
              ))}
            </ul>
            <h3 className="font-display text-lg text-deep-navy mt-5 mb-2">Notes</h3>
            <p className="text-sm text-charcoal/70 leading-relaxed">{project.notes}</p>
          </section>
        </div>
      </main>
    </>
  );
}

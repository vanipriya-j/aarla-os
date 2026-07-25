import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { listProjects } from "@/lib/application/services";
import type { Project } from "@/lib/types";
import { FolderKanban } from "lucide-react";

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function ProjectsPage() {
  let projects: Project[] = [];
  let error: string | null = null;
  try {
    projects = (await listProjects()) as Project[];
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <>
      <Header
        title="Projects"
        subtitle="Worlds, client work, sourcing trips and launches in one place."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        <div className="grid md:grid-cols-2 gap-4">
          {projects.map((p, i) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className={`card-surface p-5 hover:border-aarla-red/40 transition animate-fade-up stagger-${(i % 5) + 1}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-pale-cream border border-border flex items-center justify-center text-aarla-red">
                    <FolderKanban className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl text-deep-navy leading-snug">{p.name}</h2>
                    {p.world ? (
                      <p className="text-xs text-charcoal/55 mt-1">World: {p.world}</p>
                    ) : null}
                  </div>
                </div>
                <StatusChip label={p.status} tone={statusToneFromLabel(p.status)} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-charcoal/45">Deadline</p>
                  <p className="font-medium text-deep-navy mt-0.5">{p.deadline}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal/45">Budget</p>
                  <p className="font-medium text-deep-navy mt-0.5">{formatINR(p.budget)}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal/45">Committed</p>
                  <p className="font-medium text-deep-navy mt-0.5">{formatINR(p.capitalCommitted)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.linkedProducts.slice(0, 2).map((prod) => (
                  <StatusChip key={prod} label={prod} tone="neutral" />
                ))}
                {p.risks.length ? (
                  <StatusChip label={`${p.risks.length} risk${p.risks.length > 1 ? "s" : ""}`} tone="warning" />
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

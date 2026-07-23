import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

interface TaskTileProps {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  index?: number;
}

export function TaskTile({ label, description, href, icon: Icon, index = 0 }: TaskTileProps) {
  const delay = Math.min(index, 9);
  return (
    <Link
      href={href}
      className={`group card-surface p-5 flex flex-col gap-4 hover:border-aarla-red/40 hover:shadow-[var(--shadow-md)] transition-all duration-300 animate-fade-up stagger-${(delay % 5) + 1}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="h-11 w-11 rounded-xl bg-pale-cream border border-border flex items-center justify-center text-aarla-red group-hover:bg-aarla-red group-hover:text-white transition-colors">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <ArrowUpRight className="h-4 w-4 text-border-strong group-hover:text-aarla-red transition-colors" />
      </div>
      <div>
        <h3 className="font-display text-lg text-deep-navy leading-snug mb-1.5">{label}</h3>
        <p className="text-sm text-charcoal/70 leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}

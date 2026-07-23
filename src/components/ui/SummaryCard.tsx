import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface SummaryCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  accent?: "red" | "navy" | "mustard" | "green" | "orange";
  children?: ReactNode;
}

const accents = {
  red: "text-aarla-red",
  navy: "text-deep-navy",
  mustard: "text-mustard",
  green: "text-[#5a6b48]",
  orange: "text-warm-orange",
};

export function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "navy",
  children,
}: SummaryCardProps) {
  return (
    <div className="card-surface p-5 animate-fade-up">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-xs font-medium uppercase tracking-wider text-charcoal/55">{label}</p>
        {Icon ? (
          <div className="h-8 w-8 rounded-lg bg-pale-cream border border-border flex items-center justify-center text-deep-navy">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <p className={`font-display text-2xl md:text-3xl ${accents[accent]}`}>{value}</p>
      {hint ? <p className="mt-2 text-sm text-charcoal/60">{hint}</p> : null}
      {children}
    </div>
  );
}

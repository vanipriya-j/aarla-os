import Link from "next/link";
import type { JourneyStage } from "@/lib/domain";

const toneClass: Record<NonNullable<JourneyStage["tone"]>, string> = {
  default: "border-border bg-white",
  accent: "border-aarla-red/30 bg-aarla-red/5",
  muted: "border-border bg-pale-cream",
  success: "border-muted-green/50 bg-muted-green/20",
  warning: "border-mustard/40 bg-mustard/15",
};

export function JourneyTimeline({ stages }: { stages: JourneyStage[] }) {
  return (
    <ol className="relative space-y-0">
      {stages.map((stage, index) => {
        const body = (
          <div
            className={`rounded-2xl border px-5 py-4 transition hover:border-aarla-red/35 ${
              toneClass[stage.tone ?? "default"]
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-aarla-red">
              {stage.label}
            </p>
            <p className="mt-1 text-sm text-deep-navy leading-relaxed">{stage.detail}</p>
          </div>
        );

        return (
          <li key={stage.id} className="relative pl-8 pb-6 last:pb-0">
            <span className="absolute left-[7px] top-3 h-3 w-3 rounded-full bg-aarla-red ring-4 ring-warm-cream" />
            {index < stages.length - 1 ? (
              <span className="absolute left-[12px] top-6 bottom-0 w-px bg-border-strong" />
            ) : null}
            {stage.href ? <Link href={stage.href}>{body}</Link> : body}
          </li>
        );
      })}
    </ol>
  );
}

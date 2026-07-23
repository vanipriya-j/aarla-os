import type { StatusTone } from "@/lib/types";

const toneStyles: Record<StatusTone, string> = {
  neutral: "bg-soft-beige text-charcoal",
  info: "bg-deep-navy/10 text-deep-navy",
  success: "bg-muted-green/35 text-[#3d4a32]",
  warning: "bg-mustard/25 text-[#7a5a10]",
  danger: "bg-aarla-red/10 text-aarla-red",
  accent: "bg-warm-orange/20 text-[#8a4a18]",
};

interface StatusChipProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

export function StatusChip({ label, tone = "neutral", className = "" }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide ${toneStyles[tone]} ${className}`}
    >
      {label}
    </span>
  );
}

export function statusToneFromLabel(label: string): StatusTone {
  const l = label.toLowerCase();
  if (["paid", "delivered", "published", "completed", "active", "ready", "success"].some((k) => l.includes(k)))
    return "success";
  if (["pending", "draft", "idea", "awaiting", "partial", "review", "planning"].some((k) => l.includes(k)))
    return "warning";
  if (["hold", "missing", "damaged", "danger", "low", "blocked", "refund"].some((k) => l.includes(k)))
    return "danger";
  if (["progress", "production", "scheduled", "manufacturing", "sent", "packed"].some((k) => l.includes(k)))
    return "info";
  if (["fast", "high"].some((k) => l.includes(k))) return "accent";
  return "neutral";
}

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Button } from "./Button";
import Link from "next/link";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="card-surface-pale p-10 text-center flex flex-col items-center gap-3">
      <div className="h-12 w-12 rounded-2xl bg-white border border-border flex items-center justify-center text-deep-navy">
        <Icon className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <h3 className="font-display text-xl text-deep-navy">{title}</h3>
      <p className="text-sm text-charcoal/65 max-w-md">{description}</p>
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="mt-2">
          <Button>{actionLabel}</Button>
        </Link>
      ) : null}
      {actionLabel && onAction ? (
        <Button className="mt-2" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className = "" }: FormSectionProps) {
  return (
    <section className={`card-surface p-6 ${className}`}>
      <div className="mb-5 pb-4 border-b border-border">
        <h3 className="font-display text-xl text-deep-navy">{title}</h3>
        {description ? <p className="mt-1 text-sm text-charcoal/65">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
}

export function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-deep-navy mb-1.5">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-charcoal/55">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[10px] border border-border bg-white px-3 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:outline-none focus:ring-2 focus:ring-aarla-red/25 focus:border-aarla-red/50 transition";

export const selectClass = inputClass;
export const textareaClass = `${inputClass} min-h-[96px] resize-y`;

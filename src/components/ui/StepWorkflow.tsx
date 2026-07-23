"use client";

import { Check } from "lucide-react";

interface Step {
  id: string;
  label: string;
}

interface StepWorkflowProps {
  steps: Step[];
  current: number;
  onStepClick?: (index: number) => void;
}

export function StepWorkflow({ steps, current, onStepClick }: StepWorkflowProps) {
  return (
    <ol className="flex flex-wrap gap-2 md:gap-0 md:items-center">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.id} className="flex items-center">
            <button
              type="button"
              onClick={() => onStepClick?.(index)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-aarla-red text-white"
                  : done
                    ? "bg-muted-green/30 text-[#3d4a32]"
                    : "bg-white border border-border text-charcoal/55"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                  active
                    ? "bg-white/20"
                    : done
                      ? "bg-muted-green/50"
                      : "bg-soft-beige"
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="whitespace-nowrap">{step.label}</span>
            </button>
            {index < steps.length - 1 ? (
              <span className="hidden md:block w-6 h-px bg-border mx-1" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

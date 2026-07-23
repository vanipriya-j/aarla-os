"use client";

import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, onClose, title, children, footer, wide }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <button
        type="button"
        aria-label="Close dialog backdrop"
        className="absolute inset-0 bg-deep-navy/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] overflow-hidden rounded-2xl bg-white border border-border shadow-[var(--shadow-md)] animate-fade-up`}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border bg-pale-cream">
          <h2 className="font-display text-xl text-deep-navy">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-soft-beige flex items-center justify-center text-charcoal/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-140px)]">{children}</div>
        {footer ? (
          <div className="px-6 py-4 border-t border-border bg-pale-cream/60 flex justify-end gap-2">
            {footer}
          </div>
        ) : (
          <div className="px-6 py-4 border-t border-border bg-pale-cream/60 flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

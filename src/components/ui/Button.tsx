import { type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-aarla-red text-white hover:bg-[#9a0320] shadow-sm border border-transparent",
  secondary:
    "bg-deep-navy text-white hover:bg-[#122a4a] shadow-sm border border-transparent",
  outline:
    "bg-white text-deep-navy border border-border-strong hover:border-deep-navy hover:bg-pale-cream",
  ghost: "bg-transparent text-deep-navy hover:bg-soft-beige/60 border border-transparent",
  danger:
    "bg-white text-aarla-red border border-aarla-red/30 hover:bg-aarla-red/5",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2 text-sm rounded-[10px]",
  lg: "px-5 py-2.5 text-base rounded-xl",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

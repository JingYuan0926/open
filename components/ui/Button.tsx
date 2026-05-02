import * as React from "react";
import { Icon, IconName } from "@/components/ui/Icon";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export function Button({
  variant = "secondary", size = "md", icon, iconRight, children, onClick, disabled, type = "button", className,
}: {
  variant?: Variant; size?: Size; icon?: IconName; iconRight?: IconName;
  children?: React.ReactNode; onClick?: () => void; disabled?: boolean;
  type?: "button" | "submit"; className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/30";
  const sizes = {
    sm: "h-7 px-2.5 text-[12.5px]",
    md: "h-8 px-3 text-[13px]",
    lg: "h-9 px-4 text-sm",
  }[size];
  const variants = {
    primary: "bg-accent text-accent-fg hover:bg-accent/90 border border-transparent",
    secondary: "bg-white text-ink border border-border hover:bg-surface-2 hover:border-border-strong",
    ghost: "bg-transparent text-ink-2 hover:bg-surface-3 hover:text-ink border border-transparent",
    danger: "bg-red-50 text-red-800 border border-red-200 hover:bg-red-100",
  }[variant];
  const iconOnly = !children && icon ? "px-0 w-8" : "";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={clsx(base, sizes, variants, iconOnly, className)}>
      {icon && <Icon name={icon} size={14} />}
      {children}
      {iconRight && <Icon name={iconRight} size={14} />}
    </button>
  );
}

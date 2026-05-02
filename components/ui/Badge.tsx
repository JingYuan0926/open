import * as React from "react";
import clsx from "clsx";

type BadgeVariant = "neutral" | "success" | "warn" | "danger" | "info";

export function Badge({ variant = "neutral", mono, dot, children }:
  { variant?: BadgeVariant; mono?: boolean; dot?: boolean; children: React.ReactNode }) {
  const styles = {
    neutral: "bg-white text-ink-2 border-border",
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    danger: "bg-red-50 text-red-800 border-red-200",
    info: "bg-blue-50 text-blue-800 border-blue-200",
  }[variant];
  const dotColor = { neutral: "bg-ink-4", success: "bg-emerald-500", warn: "bg-amber-500", danger: "bg-red-500", info: "bg-blue-500" }[variant];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-medium border whitespace-nowrap", styles, mono && "font-mono text-[11px]")}>
      {dot && <span className={clsx("w-1.5 h-1.5 rounded-full", dotColor)} />}
      {children}
    </span>
  );
}

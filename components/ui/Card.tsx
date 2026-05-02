import * as React from "react";
import clsx from "clsx";

export function Card({ children, padded = false, className }: { children: React.ReactNode; padded?: boolean; className?: string }) {
  return <div className={clsx("bg-white border border-border rounded-md", padded && "p-4", className)}>{children}</div>;
}

export function CardHeader({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
      {icon}
      <div className="text-[13.5px] font-semibold flex-1">{children}</div>
    </div>
  );
}

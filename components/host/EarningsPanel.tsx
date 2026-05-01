import * as React from "react";
import { Icon, IconName } from "@/components/ui/Icon";
import clsx from "clsx";

export function EarningsPanel({ label, icon, value, delta, deltaDir, spark }: {
  label: string; icon: IconName; value: string; delta?: string; deltaDir?: "up" | "down"; spark?: number[];
}) {
  return (
    <div className="p-4 bg-white border border-border rounded-md">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-3 mb-2"><Icon name={icon} size={13} />{label}</div>
      <div className="text-[22px] font-medium tracking-tight tabular-nums text-ink">{value}</div>
      {delta && <div className={clsx("flex items-center gap-1 text-[11.5px] mt-1", deltaDir === "up" ? "text-emerald-700" : "text-red-700")}><Icon name="arrow-up" size={12} />{delta}</div>}
      {spark && (
        <div className="flex items-end gap-0.5 h-7 mt-2">
          {spark.map((v, i) => <span key={i} className="flex-1 bg-emerald-500 opacity-70 rounded-sm min-h-[2px]" style={{ height: `${Math.max(8, v * 100)}%` }} />)}
        </div>
      )}
    </div>
  );
}

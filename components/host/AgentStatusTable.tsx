import * as React from "react";
import { Badge } from "@/components/ui/Badge";
import type { Invocation } from "@/types";

export function AgentStatusTable({ rows }: { rows: Invocation[] }) {
  const statusBadge = (s: Invocation["status"]) => {
    if (s === "completed") return <Badge variant="success" dot>completed</Badge>;
    if (s === "running") return <Badge variant="info" dot>running</Badge>;
    return <Badge variant="warn" dot>approval</Badge>;
  };
  return (
    <div className="bg-white border border-border rounded-md overflow-hidden">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {["Task","Agent","Status","Revenue","Time"].map((h, i) => (
              <th key={h} className={`text-left font-medium text-[11.5px] text-ink-3 uppercase tracking-wider px-3.5 py-2.5 bg-surface-2 border-b border-border ${i >= 3 ? "text-right" : ""}`} style={i === 0 ? { width: "44%" } : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-surface-2">
              <td className="px-3.5 py-3 border-b border-border text-ink font-medium last:border-b-0">{r.task}</td>
              <td className="px-3.5 py-3 border-b border-border text-ink-2 last:border-b-0">{r.agent}</td>
              <td className="px-3.5 py-3 border-b border-border last:border-b-0">{statusBadge(r.status)}</td>
              <td className="px-3.5 py-3 border-b border-border text-right font-mono text-[12.5px] last:border-b-0">{r.revenue}</td>
              <td className="px-3.5 py-3 border-b border-border text-right text-ink-3 last:border-b-0">{r.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

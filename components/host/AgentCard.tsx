import * as React from "react";
import { Badge } from "@/components/ui/Badge";
import type { HostedAgent } from "@/types";

export function AgentCard({ agent, onClick }: { agent: HostedAgent; onClick: () => void }) {
  const variant = agent.status === "online" ? "success" : agent.status === "syncing" ? "warn" : "neutral";
  return (
    <button type="button" onClick={onClick}
      className="bg-white border border-border rounded-md overflow-hidden text-left hover:border-border-strong transition-colors w-full">
      <div className="p-3.5 flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-md bg-surface-3 grid place-items-center font-medium text-[12px] text-ink shrink-0">{agent.initials}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[13.5px]">{agent.name}</div>
          <div className="text-[12px] text-ink-3 mt-0.5">{agent.skill}</div>
        </div>
        <Badge variant={variant} dot>{agent.status}</Badge>
      </div>
      <div className="flex flex-wrap gap-1 px-3.5 pb-3">
        {agent.skills.map((s) => (
          <span key={s} className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-3 text-ink-2 text-[11.5px] font-medium border border-border">{s}</span>
        ))}
      </div>
      <div className="grid grid-cols-3 border-t border-border bg-surface-2">
        {[
          { l: "Price / call", v: agent.pricePerCall },
          { l: "Calls today", v: agent.callsToday },
          { l: "Rating", v: `${agent.rating} ★` },
        ].map((s, i) => (
          <div key={i} className={`p-2.5 ${i < 2 ? "border-r border-border" : ""}`}>
            <div className="text-[10.5px] text-ink-4 uppercase tracking-wider">{s.l}</div>
            <div className="text-[13px] font-semibold mt-0.5 tabular-nums">{s.v}</div>
          </div>
        ))}
      </div>
    </button>
  );
}

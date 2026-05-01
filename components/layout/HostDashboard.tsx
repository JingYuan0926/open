import * as React from "react";
import { EarningsPanel } from "@/components/host/EarningsPanel";
import { AgentBuilderForm } from "@/components/host/AgentBuilderForm";
import { AgentCard } from "@/components/host/AgentCard";
import { AgentStatusTable } from "@/components/host/AgentStatusTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { HOSTED_AGENTS, RECENT_INVOCATIONS } from "@/lib/mock-data";

export function HostDashboard({ onAgentClick }: { onAgentClick: (id: string) => void }) {
  return (
    <div className="overflow-y-auto px-8 py-6 pb-16">
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-[20px] font-medium tracking-tight m-0">Host Console</h1>
          <p className="text-ink-3 text-[13.5px] mt-1">Run, monitor, and earn from specialist agents.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon="terminal">Logs</Button>
          <Button variant="primary" icon="plus">Publish specialist</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6 max-[1080px]:grid-cols-2">
        <EarningsPanel label="Active agents" icon="agents" value="4 / 5" delta="1 syncing" deltaDir="up" />
        <EarningsPanel label="Total calls (24h)" icon="tasks" value="832" delta="+12.4%" deltaDir="up" spark={[0.3,0.45,0.4,0.6,0.5,0.7,0.85,0.7,0.9,0.78,0.95,1]} />
        <EarningsPanel label="Success rate" icon="check" value="98.2%" delta="+0.4%" deltaDir="up" />
        <EarningsPanel label="Earnings (30d)" icon="earnings" value="$6,551.20" delta="+18.1%" deltaDir="up" spark={[0.2,0.3,0.5,0.4,0.55,0.6,0.7,0.65,0.8,0.85,0.9,0.95]} />
      </div>

      <AgentBuilderForm />

      <div className="h-4" />
      <div className="flex items-center gap-3 my-3">
        <div className="text-[14px] font-medium">Your specialists</div>
        <Badge variant="neutral">{HOSTED_AGENTS.length} hosted</Badge>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" icon="search">Filter</Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 mb-7">
        {HOSTED_AGENTS.map((a) => (<AgentCard key={a.id} agent={a} onClick={() => onAgentClick(a.id)} />))}
      </div>

      <div className="flex items-center gap-3 my-3">
        <div className="text-[14px] font-medium">Recent invocations</div>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" iconRight="arrow-up-right">View all</Button>
      </div>
      <AgentStatusTable rows={RECENT_INVOCATIONS} />
    </div>
  );
}

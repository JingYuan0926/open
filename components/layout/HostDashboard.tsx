import * as React from "react";
import { EarningsPanel } from "@/components/host/EarningsPanel";
import { AgentBuilderForm } from "@/components/host/AgentBuilderForm";
import { AgentCard } from "@/components/host/AgentCard";
import { AgentStatusTable } from "@/components/host/AgentStatusTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { RECENT_INVOCATIONS } from "@/lib/mock-data";
import { useMySpecialists, type MySpecialist } from "@/lib/ens/SpecialistRegistrar";
import type { HostedAgent } from "@/types";

function toHostedAgent(s: MySpecialist): HostedAgent {
  const skillsArr = s.records.skills
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const initials = (s.label.match(/[a-z0-9]/gi)?.slice(0, 2).join("") || s.label.slice(0, 2)).toUpperCase();
  const axlShort = s.records.axlPubkey
    ? `${s.records.axlPubkey.slice(0, 8)}…${s.records.axlPubkey.slice(-6)}`
    : "—";
  return {
    id: `ens:${s.label}`,
    initials,
    name: s.fullName,
    skill: skillsArr[0] ?? "Specialist",
    description: "",
    status: "online",
    skills: skillsArr.length > 0 ? skillsArr : ["unspecified"],
    pricePerCall: s.records.price ? `${s.records.price} USDC` : "—",
    rating: 0,
    callsToday: 0,
    successRate: 100,
    earnings: "$0.00",
    owner: s.owner,
    ens: s.fullName,
    axlPubkey: axlShort,
    storageUri: s.records.workspaceUri || "—",
    inft: s.records.tokenId ? `iNFT #${s.records.tokenId}` : "—",
    runtime: s.records.version ? `v${s.records.version}` : "—",
    created: "Just registered",
  };
}

export function HostDashboard({ onAgentClick }: { onAgentClick: (id: string) => void }) {
  const { data: onChain = [], isFetching, refetch, error } = useMySpecialists();
  const onChainAgents = React.useMemo(() => onChain.map(toHostedAgent), [onChain]);

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
        <Badge variant="neutral">{onChainAgents.length} hosted</Badge>
        {error && (
          <Badge variant="warn">Couldn&rsquo;t read chain</Badge>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          icon="refresh"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
        <Button variant="ghost" size="sm" icon="search">Filter</Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 mb-7">
        {onChainAgents.map((a) => (<AgentCard key={a.id} agent={a} onClick={() => onAgentClick(a.id)} />))}
      </div>
      {onChainAgents.length === 0 && !isFetching && (
        <div className="border border-dashed border-border rounded-md px-4 py-8 text-center text-[13px] text-ink-3 mb-7">
          No specialists registered to this wallet yet. Publish one above to see it appear here.
        </div>
      )}

      <div className="flex items-center gap-3 my-3">
        <div className="text-[14px] font-medium">Recent invocations</div>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" iconRight="arrow-up-right">View all</Button>
      </div>
      <AgentStatusTable rows={RECENT_INVOCATIONS} />
    </div>
  );
}

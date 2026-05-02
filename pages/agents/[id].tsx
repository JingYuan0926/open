import * as React from "react";
import { useRouter } from "next/router";
import { AppShell } from "@/components/layout/AppShell";
import { AgentProfile } from "@/components/agents/AgentProfile";
import { AgentRuntimePanel } from "@/components/agents/AgentRuntimePanel";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { Icon } from "@/components/ui/Icon";
import { Field } from "@/components/ui/Input";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { HOSTED_AGENTS } from "@/lib/mock-data";

type TabId = "overview" | "logs" | "history" | "pricing";

export default function AgentDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const agent = HOSTED_AGENTS.find(a => a.id === id) || HOSTED_AGENTS[0];
  const [tab, setTab] = React.useState<TabId>("overview");
  const [paused, setPaused] = React.useState(agent.status === "offline");

  return (
    <AppShell mode="host" crumbs={["Right-Hand", "Host Console", agent.name]}>
      <div className="overflow-y-auto px-8 py-6 pb-16">
        <div className="flex items-center gap-2 mb-3.5 text-[13px] text-ink-3">
          <button onClick={() => router.push("/host")} className="text-ink-2 hover:text-ink">← Host Console</button>
          <span className="text-ink-4">/</span><span>Agents</span>
          <span className="text-ink-4">/</span><span className="text-ink">{agent.name}</span>
        </div>

        <AgentProfile agent={agent} paused={paused} onTogglePause={() => setPaused(!paused)} />
        <Tabs<TabId> tabs={[
          { id: "overview", label: "Overview" },
          { id: "logs", label: "Runtime logs" },
          { id: "history", label: "Task history" },
          { id: "pricing", label: "Pricing" },
        ]} value={tab} onChange={setTab} />
        <div className="h-4" />

        {tab === "overview" && (
          <div className="grid grid-cols-[1fr_320px] gap-5 max-[1080px]:grid-cols-1">
            <Card>
              <CardHeader icon={<Icon name="cube" size={14} />}>Identity & infrastructure</CardHeader>
              <div className="p-4">
                {[
                  ["ENS name", agent.ens, true],
                  ["AXL node", `${agent.axlPubkey} · connected`, true],
                  ["0G memory", agent.storageUri, true],
                  ["iNFT", `${agent.inft} · owner ${agent.owner}`, true],
                  ["Runtime", agent.runtime, false],
                ].map(([k, v, mono], i) => (
                  <div key={i} className="grid grid-cols-[130px_1fr] gap-3 py-2.5 border-b border-border last:border-b-0 text-[13px]">
                    <span className="text-ink-3">{k}</span>
                    <span className={mono ? "font-mono text-[12px] text-ink break-all" : "text-ink"}>{v}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader icon={<Icon name="earnings" size={14} />}>Pricing</CardHeader>
              <div className="p-4 grid gap-2 text-[13px]">
                <div className="flex justify-between"><span className="text-ink-3">Per call</span><span>{agent.pricePerCall}</span></div>
                <div className="flex justify-between"><span className="text-ink-3">Earnings (30d)</span><span>{agent.earnings}</span></div>
                <div className="flex justify-between"><span className="text-ink-3">Rating</span><span>{agent.rating} ★</span></div>
                <div className="flex justify-between"><span className="text-ink-3">Settlement</span><span>Daily · USDC</span></div>
              </div>
            </Card>
          </div>
        )}

        {tab === "logs" && <AgentRuntimePanel agent={agent} />}

        {tab === "history" && (
          <Card>
            <table className="w-full text-[13px]">
              <thead>
                <tr>{["Task","Caller","Mode","Outcome","Earned"].map((h, i) => (
                  <th key={h} className={`text-left font-medium text-[11.5px] text-ink-3 uppercase tracking-wider px-3.5 py-2.5 bg-surface-2 border-b border-border ${i === 4 ? "text-right" : ""}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="hover:bg-surface-2">
                    <td className="px-3.5 py-3 border-b border-border text-ink font-medium last:border-b-0">{["Bootstrap OpenClaw","Verify migration","Resolve peer warnings","Patch lockfile"][i % 4]}</td>
                    <td className="px-3.5 py-3 border-b border-border font-mono text-[12px] last:border-b-0">{["alex.eth","rin.eth","coord.righthand.eth","ops.righthand.eth"][i%4]}</td>
                    <td className="px-3.5 py-3 border-b border-border text-ink-2 last:border-b-0">{["Solo","Pair","Swarm","Deep Swarm"][i%4]}</td>
                    <td className="px-3.5 py-3 border-b border-border last:border-b-0"><Badge variant="success" dot>completed</Badge></td>
                    <td className="px-3.5 py-3 border-b border-border text-right font-mono text-[12.5px] last:border-b-0">{agent.pricePerCall}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === "pricing" && (
          <div className="grid grid-cols-[1fr_320px] gap-5 max-[1080px]:grid-cols-1">
            <Card>
              <CardHeader icon={<Icon name="earnings" size={14} />}>Pricing rules</CardHeader>
              <div className="p-4 grid gap-3">
                <Field label="Per call"><Input defaultValue={agent.pricePerCall} /></Field>
                <Field label="Per token (input)"><Input defaultValue="$0.000020" /></Field>
                <Field label="Per token (output)"><Input defaultValue="$0.000060" /></Field>
                <Field label="Settlement currency"><Input defaultValue="USDC" /></Field>
                <div><Button variant="primary" icon="check">Save pricing rules</Button></div>
              </div>
            </Card>
            <Card>
              <CardHeader icon={<Icon name="cube" size={14} />}>iNFT payment rules</CardHeader>
              <div className="p-4 grid gap-2 text-[13px]">
                <div className="flex justify-between"><span className="text-ink-3">Owner share</span><span>92%</span></div>
                <div className="flex justify-between"><span className="text-ink-3">Coordinator fee</span><span>5%</span></div>
                <div className="flex justify-between"><span className="text-ink-3">Network fee</span><span>3%</span></div>
                <div className="flex justify-between"><span className="text-ink-3">Beneficiary</span><span className="font-mono text-[12px]">{agent.owner}</span></div>
                <div className="mt-2"><Button variant="secondary" icon="edit">Sign & update</Button></div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

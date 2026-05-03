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
import {
  useAllSpecialists,
  type AnySpecialist,
} from "@/lib/ens/SpecialistRegistrar";
import { ENS_PARENT_DOMAIN } from "@/lib/networkConfig";
import type { HostedAgent } from "@/types";

type TabId = "overview" | "logs" | "history" | "pricing";

function shortAddr(a: string) {
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function toHostedAgent(s: AnySpecialist): HostedAgent {
  const skillsArr = s.records.skills
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const initials = (
    s.label.match(/[a-z0-9]/gi)?.slice(0, 2).join("") || s.label.slice(0, 2)
  ).toUpperCase();
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
    // axlPubkey / inft / runtime are no longer persisted on the specialist —
    // HostedAgent still requires the fields for the mock-data fallback path,
    // so set them to "" and let the renderer skip empty values.
    axlPubkey: "",
    storageUri: s.records.workspaceUri || "—",
    inft: "",
    runtime: "",
    created: "on-chain",
  };
}

function IdentityRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 py-2.5 border-b border-border last:border-b-0 text-[13px]">
      <span className="text-ink-3">{label}</span>
      <span
        className={
          mono ? "font-mono text-[12px] text-ink break-all" : "text-ink"
        }
      >
        {children}
      </span>
    </div>
  );
}

export default function AgentDetailPage() {
  const router = useRouter();
  const rawId = typeof router.query.id === "string" ? router.query.id : "";
  const ensLabel = rawId.startsWith("ens:") ? rawId.slice(4) : null;

  const {
    data: specialists = [],
    isFetching,
    refetch,
    error,
  } = useAllSpecialists();

  const onChainSpecialist = React.useMemo<AnySpecialist | null>(() => {
    if (!ensLabel) return null;
    return specialists.find((s) => s.label === ensLabel) ?? null;
  }, [ensLabel, specialists]);

  const fallback =
    HOSTED_AGENTS.find((a) => a.id === rawId) || HOSTED_AGENTS[0];
  const agent: HostedAgent = onChainSpecialist
    ? toHostedAgent(onChainSpecialist)
    : fallback;

  const [tab, setTab] = React.useState<TabId>("overview");
  const [paused, setPaused] = React.useState(agent.status === "offline");

  if (ensLabel && !onChainSpecialist && isFetching) {
    return (
      <AppShell mode="host" crumbs={["Right-Hand", "Host Console", "Loading…"]}>
        <div className="overflow-y-auto px-8 py-6 pb-16">
          <div className="border border-dashed border-border rounded-md px-4 py-10 text-center text-[13px] text-ink-3">
            Loading on-chain specialist data…
          </div>
        </div>
      </AppShell>
    );
  }

  if (ensLabel && !onChainSpecialist && !isFetching) {
    const fullName = `${ensLabel}.${ENS_PARENT_DOMAIN}`;
    return (
      <AppShell mode="host" crumbs={["Right-Hand", "Host Console", fullName]}>
        <div className="overflow-y-auto px-8 py-6 pb-16">
          <div className="flex items-center gap-2 mb-4 text-[13px] text-ink-3">
            <button
              onClick={() => router.push("/host")}
              className="text-ink-2 hover:text-ink"
            >
              ← Host Console
            </button>
            <span className="text-ink-4">/</span>
            <span>Agents</span>
            <span className="text-ink-4">/</span>
            <span className="text-ink font-mono">{fullName}</span>
          </div>
          <div className="border border-dashed border-border rounded-md px-4 py-10 text-center text-[13px] text-ink-3">
            No specialist with label{" "}
            <span className="font-mono">{ensLabel}</span> found in the on-chain
            registry.{" "}
            {error && (
              <span className="text-amber-700">
                (chain read failed — try refreshing)
              </span>
            )}
            <div className="mt-3">
              <Button
                variant="secondary"
                icon="refresh"
                onClick={() => refetch()}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const records = onChainSpecialist?.records;
  const inftHref = records?.workspaceUri || "";
  const ensRecordsHref = onChainSpecialist
    ? `/api/ens/read-specialist?name=${onChainSpecialist.fullName}`
    : "";

  return (
    <AppShell mode="host" crumbs={["Right-Hand", "Host Console", agent.name]}>
      <div className="overflow-y-auto px-8 py-6 pb-16">
        <div className="flex items-center gap-2 mb-3.5 text-[13px] text-ink-3">
          <button
            onClick={() => router.push("/host")}
            className="text-ink-2 hover:text-ink"
          >
            ← Host Console
          </button>
          <span className="text-ink-4">/</span>
          <span>Agents</span>
          <span className="text-ink-4">/</span>
          <span className="text-ink">{agent.name}</span>
          {onChainSpecialist && (
            <Badge variant="info" dot>
              on-chain
            </Badge>
          )}
        </div>

        <AgentProfile
          agent={agent}
          paused={paused}
          onTogglePause={() => setPaused(!paused)}
        />
        <Tabs<TabId>
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "logs", label: "Runtime logs" },
            { id: "history", label: "Task history" },
            { id: "pricing", label: "Pricing" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="h-4" />

        {tab === "overview" && (
          <div className="grid grid-cols-[1fr_320px] gap-5 max-[1080px]:grid-cols-1">
            <Card>
              <CardHeader icon={<Icon name="cube" size={14} />}>
                <div className="flex items-center gap-2.5">
                  <span className="flex-1">Identity & infrastructure</span>
                  {onChainSpecialist && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="refresh"
                      onClick={() => refetch()}
                      disabled={isFetching}
                    >
                      {isFetching ? "Refreshing…" : "Refresh"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <div className="p-4">
                <IdentityRow label="ENS name" mono>
                  {onChainSpecialist && ensRecordsHref ? (
                    <a
                      href={ensRecordsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink underline hover:text-blue-700"
                    >
                      {agent.ens}
                    </a>
                  ) : (
                    agent.ens
                  )}
                </IdentityRow>
                {onChainSpecialist && (
                  <IdentityRow label="Owner" mono>
                    {onChainSpecialist.owner}
                  </IdentityRow>
                )}
                <IdentityRow label="0G workspace" mono>
                  {inftHref ? (
                    <a
                      href={inftHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink underline hover:text-blue-700"
                    >
                      {agent.storageUri}
                    </a>
                  ) : (
                    agent.storageUri
                  )}
                </IdentityRow>
                <IdentityRow label="Skills">
                  {agent.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {agent.skills.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-3 text-ink-2 text-[11.5px] font-medium border border-border"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-ink-3 italic">none declared</span>
                  )}
                </IdentityRow>
              </div>
            </Card>
            <Card>
              <CardHeader icon={<Icon name="earnings" size={14} />}>
                Pricing
              </CardHeader>
              <div className="p-4 grid gap-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-ink-3">Per call</span>
                  <span>{agent.pricePerCall}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Earnings (30d)</span>
                  <span>{agent.earnings}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Rating</span>
                  <span>
                    {onChainSpecialist
                      ? "—"
                      : `${agent.rating} ★`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Settlement</span>
                  <span>Daily · USDC</span>
                </div>
                {onChainSpecialist && (
                  <div className="text-[11.5px] text-ink-3 mt-2 pt-2 border-t border-border">
                    Earnings/rating not yet tracked on-chain — derived once
                    invocations land.
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {tab === "logs" && <AgentRuntimePanel agent={agent} />}

        {tab === "history" && (
          <Card>
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  {["Task", "Caller", "Mode", "Outcome", "Earned"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`text-left font-medium text-[11.5px] text-ink-3 uppercase tracking-wider px-3.5 py-2.5 bg-surface-2 border-b border-border ${i === 4 ? "text-right" : ""}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="hover:bg-surface-2">
                    <td className="px-3.5 py-3 border-b border-border text-ink font-medium last:border-b-0">
                      {
                        [
                          "Bootstrap OpenClaw",
                          "Verify migration",
                          "Resolve peer warnings",
                          "Patch lockfile",
                        ][i % 4]
                      }
                    </td>
                    <td className="px-3.5 py-3 border-b border-border font-mono text-[12px] last:border-b-0">
                      {
                        [
                          "alex.eth",
                          "rin.eth",
                          "coord.righthand.eth",
                          "ops.righthand.eth",
                        ][i % 4]
                      }
                    </td>
                    <td className="px-3.5 py-3 border-b border-border text-ink-2 last:border-b-0">
                      {["Solo", "Pair", "Swarm", "Deep Swarm"][i % 4]}
                    </td>
                    <td className="px-3.5 py-3 border-b border-border last:border-b-0">
                      <Badge variant="success" dot>
                        completed
                      </Badge>
                    </td>
                    <td className="px-3.5 py-3 border-b border-border text-right font-mono text-[12.5px] last:border-b-0">
                      {agent.pricePerCall}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === "pricing" && (
          <div className="grid grid-cols-[1fr_320px] gap-5 max-[1080px]:grid-cols-1">
            <Card>
              <CardHeader icon={<Icon name="earnings" size={14} />}>
                Pricing rules
              </CardHeader>
              <div className="p-4 grid gap-3">
                <Field label="Per call">
                  <Input defaultValue={agent.pricePerCall} />
                </Field>
                <Field label="Per token (input)">
                  <Input defaultValue="$0.000020" />
                </Field>
                <Field label="Per token (output)">
                  <Input defaultValue="$0.000060" />
                </Field>
                <Field label="Settlement currency">
                  <Input defaultValue="USDC" />
                </Field>
                <div>
                  <Button variant="primary" icon="check">
                    Save pricing rules
                  </Button>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader icon={<Icon name="cube" size={14} />}>
                iNFT payment rules
              </CardHeader>
              <div className="p-4 grid gap-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-ink-3">Owner share</span>
                  <span>92%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Coordinator fee</span>
                  <span>5%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Network fee</span>
                  <span>3%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Beneficiary</span>
                  <span className="font-mono text-[12px]">
                    {shortAddr(agent.owner)}
                  </span>
                </div>
                <div className="mt-2">
                  <Button variant="secondary" icon="edit">
                    Sign & update
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

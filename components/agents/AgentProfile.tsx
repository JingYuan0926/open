import * as React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AgentSkillTags } from "@/components/agents/AgentSkillTags";
import type { HostedAgent } from "@/types";

export function AgentProfile({ agent, paused, onTogglePause }: {
  agent: HostedAgent; paused: boolean; onTogglePause: () => void;
}) {
  const variant = paused ? "neutral" : agent.status === "syncing" ? "warn" : "success";
  const label = paused ? "paused" : agent.status;
  return (
    <div className="flex items-start gap-4 p-5 bg-white border border-border rounded-md mb-4">
      <div className="w-12 h-12 rounded-xl bg-accent text-accent-fg grid place-items-center font-medium text-[18px]">{agent.initials}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[18px] font-medium tracking-tight m-0">{agent.name}</h1>
          <Badge variant={variant} dot>{label}</Badge>
        </div>
        <div className="text-ink-3 text-[13px] mt-0.5">
          {[agent.skill, `published ${agent.created}`, agent.runtime]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <AgentSkillTags skills={agent.skills} />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" icon="edit">Edit</Button>
        <Button variant="secondary" icon="refresh">Restart</Button>
        <Button variant={paused ? "primary" : "secondary"} icon={paused ? "play" : "pause"} onClick={onTogglePause}>
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>
    </div>
  );
}

import * as React from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import type { HostedAgent } from "@/types";
import clsx from "clsx";

export function AgentRuntimePanel({ agent }: { agent: HostedAgent }) {
  const logs = [
    { ts: "12:04:18", lvl: "ok", msg: "axl handshake verified · peer=coordinator.righthand.eth" },
    { ts: "12:04:18", lvl: "info", msg: `task accepted · taskId=tk_91ab3f · mode=swarm` },
    { ts: "12:04:19", lvl: "info", msg: `loaded memory shard from 0g://ws/agents/${agent.id}/v3 (12.4kB)` },
    { ts: "12:04:20", lvl: "info", msg: `executing skill: ${agent.skills[0]}` },
    { ts: "12:04:20", lvl: "warn", msg: "approval requested · cmd=node --version · awaiting user" },
    { ts: "12:04:24", lvl: "ok", msg: "approval granted · executed in 38ms" },
    { ts: "12:04:25", lvl: "info", msg: "result published to shared scratchpad" },
    { ts: "12:04:25", lvl: "ok", msg: `task complete · billed ${agent.pricePerCall} to caller` },
  ] as const;
  return (
    <Card>
      <CardHeader icon={<Icon name="terminal" size={14} />}>
        <div className="flex items-center gap-2.5">
          <span className="flex-1">Runtime logs · live</span>
          <Badge variant="success" dot>streaming</Badge>
        </div>
      </CardHeader>
      <div className="p-4">
        <div className="font-mono text-[12px] bg-[#0B1020] text-slate-300 rounded-md px-3.5 py-3 max-h-[220px] overflow-y-auto border border-slate-800">
          {logs.map((l, i) => (
            <div key={i} className="whitespace-pre">
              <span className="text-slate-500">[{l.ts}]</span>{" "}
              <span className={clsx(
                l.lvl === "info" && "text-blue-300",
                l.lvl === "warn" && "text-amber-300",
                l.lvl === "ok" && "text-emerald-300",
              )}>{l.lvl.padEnd(4)}</span>{" "}
              {l.msg}
            </div>
          ))}
          <div className="text-slate-600">— end of stream —</div>
        </div>
      </div>
    </Card>
  );
}

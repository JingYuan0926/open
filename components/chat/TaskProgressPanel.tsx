import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { MODES } from "@/lib/mock-data";
import type { ModeId, RunState } from "@/types";

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 text-[11px] font-semibold text-ink-4 uppercase tracking-wider mb-2">
    {children}<span className="flex-1 h-px bg-border" />
  </div>
);

const Row = ({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className="flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] text-ink-2">
    {icon}<span className="flex-1 text-ink-3">{label}</span>
    <span className="font-mono text-[11.5px] text-ink">{value}</span>
  </div>
);

export function TaskProgressPanel({ run, mode }: { run: RunState | null; mode: ModeId }) {
  const ens = "righthand.eth";
  return (
    <aside className="border-l border-border bg-surface-2 flex flex-col min-h-0">
      <div className="px-4 py-3.5 border-b border-border flex items-center gap-2">
        <Icon name="cube" size={14} />
        <div className="flex-1">
          <div className="font-semibold text-[13px]">Task Progress</div>
          <div className="text-[12px] text-ink-3 mt-0.5">{run ? run.taskTitle : "Idle — waiting for a task"}</div>
        </div>
        {run && <Badge variant={run.phase === "done" ? "success" : "info"} dot>{run.phase}</Badge>}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-6">
        <div className="mb-4">
          <SectionLabel>Coordinator</SectionLabel>
          <div className="flex items-center gap-2.5 px-2.5 py-2 bg-accent-soft border border-accent/20 rounded-md">
            <div className="w-6 h-6 rounded-md bg-accent text-accent-fg grid place-items-center font-mono text-[11px] font-semibold">CO</div>
            <div className="flex-1">
              <div className="text-[12.5px] font-medium">Right-Hand Coordinator</div>
              <div className="text-[11px] text-ink-3">Mode: {MODES.find(m => m.id === mode)!.label}</div>
            </div>
            <Badge variant="success" dot>active</Badge>
          </div>
        </div>

        <div className="mb-4">
          <SectionLabel>Specialists</SectionLabel>
          {run ? run.specialists.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 bg-white border border-border rounded-md mb-1.5">
              <div className="w-6 h-6 rounded-md bg-surface-3 grid place-items-center font-mono text-[11px] font-semibold">{s.id}</div>
              <div className="flex-1">
                <div className="text-[12.5px] font-medium">{s.name}</div>
                <div className="text-[11px] text-ink-3">{s.role} · {s.id.toLowerCase()}.righthand.eth</div>
              </div>
              <Badge variant={s.state === "done" ? "success" : s.state === "active" ? "info" : "neutral"} dot>{s.state || "queued"}</Badge>
            </div>
          )) : (
            <div className="text-[12px] text-ink-3 px-1">Specialists will be summoned via ENS once a task starts.</div>
          )}
        </div>

        <div className="mb-4">
          <SectionLabel>Discovery</SectionLabel>
          <Row icon={<Icon name="globe" size={13} />} label="ENS registry" value={ens} />
          <Row icon={<Icon name="key" size={13} />} label="AXL handshake" value={run ? "verified" : "—"} />
          <Row icon={<Icon name="shield" size={13} />} label="MCP approvals" value={run ? `${run.approvalCount} pending` : "0"} />
        </div>

        <div className="mb-4">
          <SectionLabel>Workspace</SectionLabel>
          <Row icon={<Icon name="database" size={13} />} label="0G Storage" value={`ws/${run ? run.taskId : "idle"}`} />
          <Row label="encrypted memory" value={run ? `${run.memSize} kB` : "0 kB"} />
          <Row label="shared scratchpad" value={run ? "synced" : "—"} />
        </div>

        <div>
          <SectionLabel>Cost</SectionLabel>
          <Row label="This task" value={run ? run.cost : "$0.00"} />
          <Row label="Today" value="$1.42" />
        </div>
      </div>
    </aside>
  );
}

import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ClarifyCard } from "@/components/chat/ClarifyCard";
import type { ChatMessage as TChatMessage, ChatStep, ApprovalState, ReportState } from "@/types";
import clsx from "clsx";

export function StepList({ steps }: { steps: ChatStep[] }) {
  return (
    <div className="grid gap-2 my-1.5">
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 bg-white border border-border rounded-md text-[13px]">
          <div className={clsx("w-4 h-4 rounded-full mt-0.5 grid place-items-center text-[10px] shrink-0",
            s.status === "done" && "bg-emerald-500 text-white",
            s.status === "active" && "bg-accent text-accent-fg pulse-ring",
            s.status === "pending" && "bg-surface-3 border border-dashed border-border-strong text-ink-4")}>
            {s.status === "done" && <Icon name="check" size={10} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">{s.title}</div>
            {s.meta && <div className="text-[11.5px] text-ink-3 mt-0.5">{s.meta}</div>}
          </div>
          {s.status === "active" && <span className="text-[11px] text-ink-3">running…</span>}
          {s.status === "done" && s.duration && <span className="text-[11px] font-mono text-ink-3">{s.duration}</span>}
        </div>
      ))}
    </div>
  );
}

export function ApprovalCard({ actor, command, status, onApprove, onDeny }:
  { actor: string; command: string; status: ApprovalState["status"]; onApprove: () => void; onDeny: () => void }) {
  return (
    <div className="my-2 border border-border-strong bg-white rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border text-[12px] font-medium text-ink-2 uppercase tracking-wider">
        <Icon name="shield" size={14} />
        Approval required
        <span className="ml-auto text-[11px] font-medium text-ink-3 normal-case tracking-normal">via MCP</span>
      </div>
      <div className="p-3">
        <div className="text-[13.5px] mb-2.5 text-ink">{actor}</div>
        <div className="font-mono text-[12.5px] bg-surface-3 text-ink px-3 py-2.5 rounded-md mb-3 whitespace-pre-wrap border border-border">
          <span className="text-ink-4 select-none">$ </span>{command}
        </div>
        {status === "pending" && (
          <div className="flex gap-2">
            <Button variant="primary" icon="check" onClick={onApprove}>Approve</Button>
            <Button variant="secondary" icon="x" onClick={onDeny}>Deny</Button>
            <span className="ml-auto text-[11.5px] text-ink-3 self-center">read-only · no network</span>
          </div>
        )}
      </div>
      {status === "approved" && (
        <div className="px-3 py-2.5 flex items-center gap-2 text-[12.5px] bg-surface-2 border-t border-border text-ink-2">
          <Icon name="check" size={14} className="text-emerald-500" />
          Approved · ran in 38ms · output captured to 0G workspace
        </div>
      )}
      {status === "denied" && (
        <div className="px-3 py-2.5 flex items-center gap-2 text-[12.5px] bg-surface-2 border-t border-border text-ink-2">
          <Icon name="x" size={14} className="text-red-500" />
          Denied · agent will work around this constraint
        </div>
      )}
    </div>
  );
}

export function FinalReport({ title, items, onAsk }: ReportState & { onAsk: () => void }) {
  return (
    <div className="mt-2 border border-border bg-white rounded-md overflow-hidden">
      <div className="px-4 py-3.5 flex items-center gap-3 border-b border-border">
        <div className="flex-1">
          <div className="font-medium text-[14px]">{title}</div>
          <div className="text-[12px] text-ink-3 mt-0.5">All steps completed · summary saved to your tasks</div>
        </div>
        <Badge variant="success" dot>Done</Badge>
      </div>
      <div className="px-4 py-3.5">
        <div className="grid gap-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[13px] text-ink-2 leading-relaxed">
              <Icon name="check" size={14} className="mt-0.5 shrink-0 text-ink-3" />
              <span>{it}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2 px-4 py-3 border-t border-border bg-surface-2">
        <Button variant="secondary" icon="arrow-up-right">View workspace</Button>
        <Button variant="ghost" icon="refresh" onClick={onAsk}>Ask a follow-up</Button>
        <span className="ml-auto text-[11.5px] text-ink-3 self-center">Memory updated · specialists rated</span>
      </div>
    </div>
  );
}

export function ChatMessageView({ m, modeLabel, onApprove, onDeny, onClarify }: {
  m: TChatMessage; modeLabel: string;
  onApprove: () => void; onDeny: () => void;
  onClarify: (index: number, answers: Record<string, string>) => void;
}) {
  if (m.role === "user") {
    return (
      <div className="flex gap-3.5 py-4 border-t border-border first:border-t-0">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-slate-500 to-slate-800 text-white grid place-items-center text-[12px] font-semibold shrink-0">JK</div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="font-medium text-[13.5px] mb-1">You</div>
          <p className="text-[14px] leading-relaxed">{m.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3.5 py-4 border-t border-border first:border-t-0">
      <div className="w-7 h-7 rounded-md bg-accent text-accent-fg grid place-items-center text-[12px] font-medium shrink-0">R</div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="font-medium text-[13.5px] mb-1 flex items-baseline gap-2 flex-wrap">
          Right-Hand <span className="text-[12px] text-ink-3 font-normal">{modeLabel} mode</span>
        </div>
        <div className="text-[14px] leading-relaxed text-ink">
          <p className="mb-2.5">{m.intro}</p>
          <StepList steps={m.steps} />
          {m.clarifies.map((c, i) => (
            <ClarifyCard key={i} clarify={c} onSubmit={(answers) => onClarify(i, answers)} />
          ))}
          {m.approval && <ApprovalCard {...m.approval} onApprove={onApprove} onDeny={onDeny} />}
          {m.report && <FinalReport {...m.report} onAsk={() => {}} />}
        </div>
      </div>
    </div>
  );
}

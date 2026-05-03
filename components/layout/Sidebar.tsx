import * as React from "react";
import { Icon, IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import clsx from "clsx";

type NavItem = { id: string; label: string; icon: IconName; count: number | null };

export function Sidebar({ nav, currentNav, onNav, history, onNewChat, mode = "user" }: {
  nav: NavItem[]; currentNav: string; onNav: (id: string) => void;
  history: { id: string; label: string; active?: boolean }[]; onNewChat: () => void;
  mode?: "user" | "host";
}) {
  return (
    <aside className="border-r border-border bg-surface-2 flex flex-col min-h-0">
      <div className="flex items-center px-4 h-[52px] border-b border-border">
        <img
          src="/logoright.png"
          alt="Right-Hand"
          className="h-12 w-auto select-none"
          draggable={false}
        />
      </div>

      <div className="px-2.5 pt-3.5 pb-1.5">
        <div className="px-2 pb-1.5 text-[11px] font-medium text-ink-4 uppercase tracking-wider">{mode === "host" ? "Console" : "Workspace"}</div>
        {nav.map((n) => (
          <button key={n.id} onClick={() => onNav(n.id)}
            className={clsx("flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-[13.5px] text-left",
              currentNav === n.id
                ? "bg-white text-ink border border-border shadow-xs px-2 py-1"
                : "text-ink-2 hover:bg-surface-3 hover:text-ink")}>
            <Icon name={n.icon} size={15} className={currentNav === n.id ? "text-ink" : "text-ink-3"} />
            <span>{n.label}</span>
            {n.count != null && <span className={clsx("ml-auto text-[11px] px-1.5 py-px rounded-full",
              currentNav === n.id ? "bg-accent-soft text-ink-2" : "bg-surface-3 text-ink-4")}>{n.count}</span>}
          </button>
        ))}
      </div>

      {mode === "user" && (
        <>
          <div className="px-2.5 pt-3 pb-0">
            <div className="px-2 pb-1.5 text-[11px] font-medium text-ink-4 uppercase tracking-wider flex items-center">
              <span className="flex-1">Recent</span>
              <Button variant="ghost" size="sm" icon="plus" className="!h-[22px] !px-1.5 !text-[11px]" onClick={onNewChat}>New</Button>
            </div>
          </div>
          <div className="px-2.5 pb-2.5 flex-1 min-h-0 overflow-y-auto">
            {history.map((h) => (
              <div key={h.id} className={clsx("px-2.5 py-1.5 rounded-md text-[13px] cursor-pointer truncate",
                h.active ? "bg-white border border-border text-ink px-2 py-1" : "text-ink-2 hover:bg-surface-3 hover:text-ink")}>
                {h.label}
              </div>
            ))}
          </div>
        </>
      )}
      {mode === "host" && <div className="flex-1" />}

      <div className="p-2.5 border-t border-border flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-700 text-white grid place-items-center text-[12px] font-semibold">JK</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">Jordan Kim</div>
          <div className="text-[11px] text-ink-3">{mode === "host" ? "Host · 5 agents" : "Pro plan"}</div>
        </div>
        <Button variant="ghost" icon="settings" size="sm" />
      </div>
    </aside>
  );
}

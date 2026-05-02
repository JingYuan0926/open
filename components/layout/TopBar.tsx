import * as React from "react";
import { Button } from "@/components/ui/Button";
import clsx from "clsx";

export function TopBar({ crumbs, view, onSwitchView }: {
  crumbs: string[]; view: "user" | "host"; onSwitchView: (v: "user" | "host") => void;
}) {
  return (
    <header className="flex items-center gap-3 px-4 border-b border-border bg-white h-[52px]">
      <div className="flex items-center gap-2 text-ink-3 text-[13px]">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-ink-4">/</span>}
            <span className={i === crumbs.length - 1 ? "font-medium text-ink text-[13px]" : ""}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="inline-flex bg-surface-2 border border-border rounded-full p-0.5">
          {(["user","host"] as const).map((v) => (
            <button key={v} onClick={() => onSwitchView(v)}
              className={clsx("px-2.5 py-1 rounded-full text-[11.5px] font-medium",
                view === v ? "bg-white text-ink shadow-xs border border-border" : "text-ink-3 hover:text-ink")}>
              {v === "user" ? "User" : "Host"}
            </button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-full text-[12px] text-ink-3 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Connector connected
        </span>
        <Button variant="ghost" icon="bell" />
      </div>
    </header>
  );
}

import * as React from "react";
import { Icon, IconName } from "@/components/ui/Icon";
import clsx from "clsx";

export function Disclosure({ title, icon, defaultOpen = false, children, right }:
  { title: string; icon?: IconName; defaultOpen?: boolean; children: React.ReactNode; right?: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={clsx("border border-border rounded-md bg-white mb-2", open && "shadow-xs")}>
      <button type="button" onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none text-[13px] font-medium w-full text-left">
        <Icon name="chevron-right" size={14} className={clsx("text-ink-3 transition-transform", open && "rotate-90")} />
        {icon && <Icon name={icon} size={14} className="text-ink-3" />}
        <span className="flex-1">{title}</span>
        {right}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

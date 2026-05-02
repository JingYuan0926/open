import * as React from "react";
import clsx from "clsx";

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-0.5 border-b border-border px-1">
      {tabs.map((t) => (
        <button key={t.id}
          className={clsx("px-3 py-2.5 text-[13px] cursor-pointer transition-colors border-b-2 -mb-px",
            value === t.id ? "text-ink border-ink" : "text-ink-3 border-transparent hover:text-ink-2")}
          onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

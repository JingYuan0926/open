import * as React from "react";
import { MODES } from "@/lib/mock-data";
import type { ModeId } from "@/types";
import clsx from "clsx";

export function ModePicker({ mode, onChange }: { mode: ModeId; onChange: (id: ModeId) => void }) {
  const [hover, setHover] = React.useState<ModeId | null>(null);
  return (
    <div className="relative inline-flex bg-surface-2 border border-border rounded-full p-0.5">
      {MODES.map((m) => (
        <button key={m.id}
          className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium relative",
            mode === m.id ? "bg-white text-ink shadow-xs border border-border" : "text-ink-3 hover:text-ink")}
          onClick={() => onChange(m.id)}
          onMouseEnter={() => setHover(m.id)} onMouseLeave={() => setHover(null)}>
          {m.label}
          {hover === m.id && (
            <div className="absolute bottom-full left-0 mb-2 bg-white border border-border rounded-md shadow-md p-3 w-60 text-[12px] text-ink-2 z-10 text-left">
              <div className="font-semibold text-ink text-[12.5px] mb-0.5">{m.label}</div>
              <div className="text-ink-3 text-[11.5px]">{m.desc}</div>
              <div className="mt-1.5 text-ink-2">{m.hint}</div>
              <div className="flex gap-2.5 mt-1.5 text-[11px] text-ink-3">
                <span>Cost: <b className="text-ink font-medium">{m.tradeoff.cost}</b></span>
                <span>Speed: <b className="text-ink font-medium">{m.tradeoff.speed}</b></span>
              </div>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

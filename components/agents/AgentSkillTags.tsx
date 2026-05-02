import * as React from "react";

export function AgentSkillTags({ skills }: { skills: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5">
      {skills.map((s) => (
        <span key={s} className="inline-flex items-center px-2 py-0.5 rounded bg-surface-3 text-ink-2 text-[11.5px] font-medium border border-border">{s}</span>
      ))}
    </div>
  );
}

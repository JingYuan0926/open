import { Icon } from "@/components/ui/Icon";
import { EXAMPLE_PROMPTS } from "@/lib/mock-data";

export function Welcome({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div className="max-w-[760px] mx-auto px-8 mt-24">
      <h1 className="text-[28px] font-medium tracking-tight leading-tight text-ink mb-1.5 text-balance">What can we work on?</h1>
      <p className="text-[14px] text-ink-3 mb-6 max-w-[520px]">One connector, then just chat. Right-Hand routes the work to specialists and asks before touching anything sensitive.</p>
      <div className="border-t border-border">
        {EXAMPLE_PROMPTS.map((ex, i) => (
          <button key={i} onClick={() => onPick(ex.prompt)}
            className="group flex items-center gap-3 py-3.5 w-full text-left border-b border-border transition-all hover:pl-2">
            <div className="flex items-baseline gap-3 flex-1 min-w-0">
              <div className="text-[14px] text-ink-2 group-hover:text-ink leading-tight">{ex.prompt}</div>
              <div className="text-[12px] text-ink-4 ml-auto pr-3 shrink-0">{ex.meta}</div>
            </div>
            <Icon name="arrow-up-right" size={14} className="text-ink-4 transition-all group-hover:text-ink group-hover:translate-x-[2px] group-hover:-translate-y-[2px] shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { ClarifyState } from "@/types";
import clsx from "clsx";

export function ClarifyCard({
  clarify, onSubmit,
}: {
  clarify: ClarifyState;
  onSubmit: (answers: Record<string, string>) => void;
}) {
  const [picks, setPicks] = React.useState<Record<string, string>>(clarify.answers);
  const locked = clarify.status === "answered";
  const allAnswered = clarify.questions.every((q) => !!picks[q.id]);

  return (
    <div className="my-2 border border-border-strong bg-white rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border text-[12px] font-medium text-ink-2 uppercase tracking-wider">
        <Icon name="alert" size={14} />
        Question
        <span className="ml-auto text-[11px] font-medium text-ink-3 normal-case tracking-normal">{clarify.actor}</span>
      </div>
      <div className="p-3 grid gap-3.5">
        {clarify.context && <div className="text-[13px] text-ink-2 leading-relaxed">{clarify.context}</div>}
        {clarify.questions.map((q) => {
          const selected = locked ? clarify.answers[q.id] : picks[q.id];
          return (
            <div key={q.id} className="grid gap-1.5">
              <div className="text-[13.5px] font-medium text-ink">{q.question}</div>
              <div className="grid gap-1">
                {q.options.map((opt) => {
                  const isSelected = selected === opt.label;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      disabled={locked}
                      onClick={() => setPicks((p) => ({ ...p, [q.id]: opt.label }))}
                      className={clsx(
                        "flex items-start gap-2.5 text-left px-2.5 py-2 rounded-md border transition-colors",
                        isSelected ? "border-accent bg-accent-soft" : "border-border bg-white hover:bg-surface-2",
                        locked && !isSelected && "opacity-50",
                        locked && "cursor-default",
                      )}
                    >
                      <span className={clsx(
                        "mt-0.5 w-3.5 h-3.5 rounded-full border-2 grid place-items-center shrink-0",
                        isSelected ? "border-accent" : "border-border-strong",
                      )}>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-ink">{opt.label}</span>
                        {opt.description && <span className="block text-[11.5px] text-ink-3 mt-0.5">{opt.description}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!locked && (
          <div className="flex items-center gap-2 pt-1">
            <Button variant="primary" icon="check" disabled={!allAnswered} onClick={() => onSubmit(picks)}>
              Continue
            </Button>
            <span className="text-[11.5px] text-ink-3">Pick one option per question</span>
          </div>
        )}
        {locked && (
          <div className="flex items-center gap-2 pt-1 text-[12.5px] text-ink-2">
            <Icon name="check" size={14} className="text-emerald-500" />
            Answers recorded · {clarify.actor} continuing
          </div>
        )}
      </div>
    </div>
  );
}

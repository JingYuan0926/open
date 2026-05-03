import * as React from "react";
import { Welcome } from "@/components/chat/Welcome";
import { ChatInput } from "@/components/chat/ChatInput";
import { TaskCreationCard, suggestSkills } from "@/components/chat/TaskCreationCard";
import { DemoFlow } from "@/components/chat/DemoFlow";
import { MODES } from "@/lib/mock-data";
import type { ModeId } from "@/types";

type ChatItem =
  | { kind: "user"; id: string; content: string }
  | { kind: "thinking"; id: string; prompt: string; mode: ModeId }
  | { kind: "draft"; id: string; prompt: string; mode: ModeId; postedLabel?: string }
  | { kind: "demo"; id: string; label: string };

const MODE_TO_MAX: Record<ModeId, number> = {
  solo: 1,
  pair: 2,
  swarm: 3,
  deep: 5,
};

const THINKING_MS = 5000;

export function ChatInterface() {
  const [input, setInput] = React.useState("");
  const mode: ModeId = "swarm";
  const [items, setItems] = React.useState<ChatItem[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const timersRef = React.useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items]);

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const submit = (prompt: string, m: ModeId) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const stamp = Date.now().toString(36);
    const draftId = `d-${stamp}`;
    setItems((prev) => [
      ...prev,
      { kind: "user", id: `u-${stamp}`, content: trimmed },
      { kind: "thinking", id: draftId, prompt: trimmed, mode: m },
    ]);
    const t = setTimeout(() => {
      timersRef.current.delete(t);
      setItems((prev) =>
        prev.map((it) =>
          it.id === draftId && it.kind === "thinking"
            ? { kind: "draft", id: draftId, prompt: trimmed, mode: m }
            : it,
        ),
      );
    }, THINKING_MS);
    timersRef.current.add(t);
  };

  const handleSubmit = () => {
    submit(input, mode);
    setInput("");
  };
  const handlePick = (p: string) => submit(p, mode);

  const handlePosted = React.useCallback((draftId: string, label: string) => {
    setItems((prev) => {
      // Idempotent: if a demo item already exists for this draft, don't add another.
      if (prev.some((x) => x.kind === "demo" && x.id === `demo-${draftId}`)) return prev;
      const insertAt = prev.findIndex((x) => x.id === draftId);
      if (insertAt < 0) return prev;
      const next = [...prev];
      next.splice(insertAt + 1, 0, {
        kind: "demo",
        id: `demo-${draftId}`,
        label,
      });
      return next;
    });
  }, []);

  const modeLabel = MODES.find((x) => x.id === mode)!.label;

  return (
    <div className="min-h-0 min-w-0">
      <div className="grid grid-rows-[1fr_auto] h-full min-h-0 bg-bg relative">
        <div ref={scrollRef} className="overflow-y-auto pt-8 pb-6">
          {items.length === 0 ? (
            <Welcome onPick={handlePick} />
          ) : (
            <div className="max-w-[760px] mx-auto px-8">
              {items.map((it) => {
                if (it.kind === "user") return <UserBubble key={it.id} content={it.content} />;
                if (it.kind === "demo")
                  return (
                    <AssistantWrapper key={it.id} modeLabel={modeLabel}>
                      <DemoFlow taskLabel={it.label} />
                    </AssistantWrapper>
                  );
                if (it.kind === "thinking")
                  return (
                    <AssistantWrapper key={it.id} modeLabel={modeLabel}>
                      <ThinkingIndicator />
                    </AssistantWrapper>
                  );
                return (
                  <AssistantDraft
                    key={it.id}
                    draftId={it.id}
                    prompt={it.prompt}
                    modeLabel={modeLabel}
                    maxSpecialists={MODE_TO_MAX[it.mode]}
                    onPosted={handlePosted}
                  />
                );
              })}
            </div>
          )}
        </div>
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex gap-3.5 py-4 border-t border-border first:border-t-0">
      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-slate-500 to-slate-800 text-white grid place-items-center text-[12px] font-semibold shrink-0">
        JK
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="font-medium text-[13.5px] mb-1">You</div>
        <p className="text-[14px] leading-relaxed">{content}</p>
      </div>
    </div>
  );
}

function AssistantDraft({
  draftId,
  prompt,
  modeLabel,
  maxSpecialists,
  onPosted,
}: {
  draftId: string;
  prompt: string;
  modeLabel: string;
  maxSpecialists: number;
  onPosted: (draftId: string, label: string) => void;
}) {
  return (
    <AssistantWrapper modeLabel={modeLabel}>
      <p className="mb-2.5">
        Based on your prompt, here&rsquo;s the plan. Tune the budget,
        specialists, and deadline below — then post on Sepolia to invite
        matching specialists.
      </p>
      <TaskCreationCard
        initialDescription={prompt}
        initialSkills={suggestSkills(prompt)}
        initialMaxSpecialists={maxSpecialists}
        onPosted={({ label }) => onPosted(draftId, label)}
      />
    </AssistantWrapper>
  );
}

function ThinkingIndicator() {
  const steps = React.useMemo(
    () => [
      "Reading your prompt",
      "Resolving specialists from ENS",
      "Matching skills against the registry",
      "Drafting the task spec",
    ],
    [],
  );
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const tick = THINKING_MS / steps.length;
    const timers = steps.map((_, i) =>
      setTimeout(() => setActive(i + 1), tick * (i + 1)),
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [steps]);

  return (
    <div className="grid gap-1.5 text-[13.5px]">
      {steps.map((s, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <div key={i} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className={[
                "inline-block w-3 h-3 rounded-full shrink-0",
                done
                  ? "bg-emerald-500"
                  : current
                    ? "bg-accent pulse-ring"
                    : "bg-surface-3 border border-border",
              ].join(" ")}
            />
            <span className={done || current ? "text-ink" : "text-ink-3"}>
              {s}
              {current ? "…" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AssistantWrapper({
  modeLabel,
  children,
}: {
  modeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3.5 py-4 border-t border-border first:border-t-0">
      <div className="w-7 h-7 rounded-md bg-accent text-accent-fg grid place-items-center text-[12px] font-medium shrink-0">
        R
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="font-medium text-[13.5px] mb-1 flex items-baseline gap-2 flex-wrap">
          Right-Hand{" "}
          <span className="text-[12px] text-ink-3 font-normal">{modeLabel} mode</span>
        </div>
        <div className="text-[14px] leading-relaxed text-ink">{children}</div>
      </div>
    </div>
  );
}

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

const THINKING_STEP_MS = 2000;
const THINKING_STEPS = 3;
const THINKING_MS = THINKING_STEP_MS * THINKING_STEPS;

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
                      <ThinkingIndicator prompt={it.prompt} />
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
    <div className="flex justify-end py-3">
      <div className="max-w-[75%] px-4 py-2.5 rounded-2xl bg-surface-3 text-ink text-[14px] leading-relaxed whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  );
}

function StreamingText({
  text,
  speed = 55,
}: {
  text: string;
  speed?: number;
}) {
  const tokens = React.useMemo(() => text.split(/(\s+)/), [text]);
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    setCount(0);
  }, [text]);

  React.useEffect(() => {
    if (count >= tokens.length) return;
    const t = setTimeout(() => setCount((c) => c + 1), speed);
    return () => clearTimeout(t);
  }, [count, tokens.length, speed]);

  return <>{tokens.slice(0, count).join("")}</>;
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
        <StreamingText text="Based on your prompt, here's the plan. Tune the specialists and deadline below — then post on Sepolia to invite matching specialists." />
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

function ThinkingIndicator({ prompt }: { prompt: string }) {
  const steps = React.useMemo(() => {
    const trimmed = prompt.trim();
    const short = trimmed.length > 90 ? `${trimmed.slice(0, 87)}…` : trimmed;
    return [
      {
        label: "Reading the prompt",
        commentary: `User wants: "${short}". Identifying intent and required skills.`,
      },
      {
        label: "Designing the task",
        commentary: "Drafting the description, picking specialist count, and pricing the deadline.",
      },
      {
        label: "Asking permission from user",
        commentary: "Spec is ready — review the parameters and post on Sepolia when you're set.",
      },
    ];
  }, [prompt]);

  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    if (active >= steps.length - 1) return;
    const t = setTimeout(() => setActive((a) => a + 1), THINKING_STEP_MS);
    return () => clearTimeout(t);
  }, [active, steps.length]);

  const current = steps[active];

  return (
    <div className="grid gap-1.5 text-[13.5px] min-h-[44px]">
      <div className="flex items-center gap-2 text-ink">
        <span
          aria-hidden
          className="inline-block w-2.5 h-2.5 rounded-full bg-accent pulse-ring shrink-0"
        />
        <span className="font-medium">
          {current.label}
          <span className="text-ink-3">…</span>
        </span>
      </div>
      <p className="text-[12.5px] text-ink-3 italic leading-snug pl-[18px]">
        <StreamingText key={active} text={current.commentary} speed={45} />
      </p>
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

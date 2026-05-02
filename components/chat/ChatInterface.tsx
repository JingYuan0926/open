import * as React from "react";
import { Welcome } from "@/components/chat/Welcome";
import { ChatInput } from "@/components/chat/ChatInput";
import { TaskCreationCard, suggestSkills } from "@/components/chat/TaskCreationCard";
import { TaskProgressPanel } from "@/components/chat/TaskProgressPanel";
import { MODES } from "@/lib/mock-data";
import type { ModeId } from "@/types";

type ChatItem =
  | { kind: "user"; id: string; content: string }
  | { kind: "draft"; id: string; prompt: string; mode: ModeId };

const MODE_TO_MAX: Record<ModeId, number> = {
  solo: 1,
  pair: 2,
  swarm: 3,
  deep: 5,
};

export function ChatInterface() {
  const [input, setInput] = React.useState("");
  const [mode, setMode] = React.useState<ModeId>("swarm");
  const [items, setItems] = React.useState<ChatItem[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items]);

  const submit = (prompt: string, m: ModeId) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const stamp = Date.now().toString(36);
    setItems((prev) => [
      ...prev,
      { kind: "user", id: `u-${stamp}`, content: trimmed },
      { kind: "draft", id: `d-${stamp}`, prompt: trimmed, mode: m },
    ]);
  };

  const handleSubmit = () => {
    submit(input, mode);
    setInput("");
  };
  const handlePick = (p: string) => submit(p, mode);

  const modeLabel = MODES.find((x) => x.id === mode)!.label;

  return (
    <div className="grid grid-cols-[1fr_360px] min-h-0 min-w-0 max-[1080px]:grid-cols-1">
      <div className="grid grid-rows-[1fr_auto] min-h-0 bg-bg relative">
        <div ref={scrollRef} className="overflow-y-auto pt-8 pb-6">
          {items.length === 0 ? (
            <Welcome onPick={handlePick} />
          ) : (
            <div className="max-w-[760px] mx-auto px-8">
              {items.map((it) =>
                it.kind === "user" ? (
                  <UserBubble key={it.id} content={it.content} />
                ) : (
                  <AssistantDraft
                    key={it.id}
                    prompt={it.prompt}
                    modeLabel={modeLabel}
                    maxSpecialists={MODE_TO_MAX[it.mode]}
                  />
                ),
              )}
            </div>
          )}
        </div>
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          mode={mode}
          onModeChange={setMode}
        />
      </div>
      <div className="max-[1080px]:hidden">
        <TaskProgressPanel run={null} mode={mode} />
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
  prompt,
  modeLabel,
  maxSpecialists,
}: {
  prompt: string;
  modeLabel: string;
  maxSpecialists: number;
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
        <div className="text-[14px] leading-relaxed text-ink">
          <p className="mb-2.5">
            I&rsquo;ll publish this on the ENS task marketplace so matching
            specialists can sign on. Review the spec, edit anything, then post
            it on Sepolia.
          </p>
          <TaskCreationCard
            initialDescription={prompt}
            initialSkills={suggestSkills(prompt)}
            initialMaxSpecialists={maxSpecialists}
          />
        </div>
      </div>
    </div>
  );
}

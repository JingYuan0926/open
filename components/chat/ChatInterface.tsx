import * as React from "react";
import { Welcome } from "@/components/chat/Welcome";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessageView } from "@/components/chat/ChatMessage";
import { TaskProgressPanel } from "@/components/chat/TaskProgressPanel";
import { Icon } from "@/components/ui/Icon";
import { useTaskRunner } from "@/lib/task-runner";
import { MODES } from "@/lib/mock-data";
import type { ModeId } from "@/types";

export function ChatInterface() {
  const [input, setInput] = React.useState("");
  const [mode, setMode] = React.useState<ModeId>("swarm");
  const { messages, run, busy, pendingApproval, pendingClarify, submit, resolveApproval, resolveClarify } = useTaskRunner();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSubmit = () => {
    if (!input.trim() || busy) return;
    submit(input.trim(), mode);
    setInput("");
  };
  const handlePick = (p: string) => { submit(p, mode); };

  const modeLabel = MODES.find(x => x.id === mode)!.label;

  return (
    <div className="grid grid-cols-[1fr_360px] min-h-0 min-w-0 max-[1080px]:grid-cols-1">
      <div className="grid grid-rows-[1fr_auto] min-h-0 bg-bg relative">
        {(pendingApproval || pendingClarify) && (
          <div className="absolute top-3.5 right-6 z-10 flex items-center gap-2.5 bg-white text-ink border border-border-strong px-3 py-1.5 rounded-md shadow-md text-[12.5px]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 pulse-dot" />
            <span>
              {pendingClarify
                ? <><b className="font-medium">Question</b> pending — agent needs your input</>
                : <><b className="font-medium">1 approval</b> pending — sensitive action</>}
            </span>
            <Icon name="chevron-right" size={12} />
          </div>
        )}
        <div ref={scrollRef} className="overflow-y-auto pt-8 pb-6">
          {messages.length === 0 ? (
            <Welcome onPick={handlePick} />
          ) : (
            <div className="max-w-[760px] mx-auto px-8">
              {messages.map((m) => (
                <ChatMessageView key={m.id} m={m} modeLabel={modeLabel}
                  onApprove={() => resolveApproval("approved")}
                  onDeny={() => resolveApproval("denied")}
                  onClarify={(index, answers) => resolveClarify(index, answers)} />
              ))}
            </div>
          )}
        </div>
        <ChatInput value={input} onChange={setInput} onSubmit={handleSubmit}
          mode={mode} onModeChange={setMode} disabled={busy} />
      </div>
      <div className="max-[1080px]:hidden">
        <TaskProgressPanel run={run} mode={mode} />
      </div>
    </div>
  );
}

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export function ChatInput({ value, onChange, onSubmit, disabled }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void;
  disabled?: boolean;
}) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = Math.min(200, taRef.current.scrollHeight) + "px";
    }
  }, [value]);
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSubmit();
    }
  };
  return (
    <div className="px-8 pb-5 pt-4 bg-gradient-to-b from-transparent to-bg">
      <div className="max-w-[760px] mx-auto bg-white border border-border-strong rounded-xl shadow-sm focus-within:border-ink-3 focus-within:shadow-md transition-all">
        <textarea ref={taRef} rows={1} value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} onKeyDown={handleKey}
          placeholder="Tell Right-Hand what to do…"
          className="block w-full bg-transparent border-0 outline-none resize-none px-4 pt-3.5 pb-1 text-[14.5px] leading-relaxed text-ink placeholder:text-ink-4 max-h-[200px]" />
        <div className="flex items-center gap-2 px-2 pb-2 pl-3">
          <Button variant="ghost" icon="plus" size="sm">Attach</Button>
          <div className="flex-1" />
          <span className="text-[11.5px] text-ink-3 px-1">{disabled ? "Working…" : "↵ to send · ⇧↵ for newline"}</span>
          <Button variant="primary" icon="send" onClick={onSubmit} disabled={!value.trim() || disabled}>Send</Button>
        </div>
      </div>
      <div className="max-w-[760px] mx-auto mt-2 flex items-center justify-between text-[11.5px] text-ink-3 px-1">
        <span>Local actions are approval-gated. Right-Hand never executes without your okay.</span>
        <span className="inline-flex items-center gap-1"><Icon name="shield" size={12} />End-to-end encrypted via 0G</span>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

const SPECIALISTS = [
  {
    id: "AW",
    name: "AWS Provisioning Specialist",
    ens: "aws-provision.righthand.eth",
    role: "Provision",
  },
  {
    id: "OC",
    name: "OpenClaw Deployment Specialist",
    ens: "openclaw-deploy.righthand.eth",
    role: "Deploy",
  },
];

const STEPS = [
  "Open the AWS console sign-in page in your browser",
  "Auto-walk through the EC2 console pages (visual narrative)",
  "Pop a Terminal.app window that runs the AWS CLI install",
  "Provision a t3.micro EC2 instance in us-east-1",
  "SSH in, install git/Node, drop your .env, run start.sh",
];

type Phase =
  | "introducing" // animating specialists signing on
  | "ready" // both signed on, waiting for user to confirm
  | "confirm" // confirm modal open
  | "running" // demo:final spawned, polling for completion
  | "done"; // celebration modal open

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes — fallback if marker never appears

export function DemoFlow({ taskLabel }: { taskLabel: string }) {
  const [phase, setPhase] = React.useState<Phase>("introducing");
  const [signedOn, setSignedOn] = React.useState<typeof SPECIALISTS>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

  // Animate specialists signing on.
  React.useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setSignedOn([SPECIALISTS[0]]), 700));
    timers.push(setTimeout(() => setSignedOn(SPECIALISTS), 1600));
    timers.push(setTimeout(() => setPhase("ready"), 2000));
    return () => timers.forEach(clearTimeout);
  }, []);

  // Once running, poll /api/demo/status until done (or timeout).
  React.useEffect(() => {
    if (phase !== "running") return;
    const startedAt = Date.now();
    let cancelled = false;

    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const tickInterval = setInterval(tick, 1000);

    const poll = async () => {
      while (!cancelled) {
        if (Date.now() - startedAt >= TIMEOUT_MS) {
          if (!cancelled) setPhase("done");
          return;
        }
        try {
          const r = await fetch("/api/demo/status");
          if (r.ok) {
            const body = await r.json();
            if (body.done) {
              if (!cancelled) setPhase("done");
              return;
            }
          }
        } catch {
          // ignore — retry next tick
        }
        await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearInterval(tickInterval);
    };
  }, [phase]);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/demo/start", { method: "POST" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      setPhase("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start demo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="my-2 border border-border-strong bg-white rounded-md overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border text-[12px] font-medium text-ink-2 uppercase tracking-wider">
          <Icon name="users" size={14} />
          Specialists signed on
          <span className="ml-auto text-[11px] font-medium text-ink-3 normal-case tracking-normal">
            for {taskLabel}.righthand.eth
          </span>
        </div>
        <div className="p-3 grid gap-2">
          {SPECIALISTS.map((s) => {
            const isSignedOn = signedOn.some((x) => x.id === s.id);
            return (
              <div
                key={s.id}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md border transition-colors ${
                  isSignedOn ? "border-emerald-200 bg-emerald-50" : "border-border bg-surface-2"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-md grid place-items-center font-mono text-[11.5px] font-semibold ${
                    isSignedOn ? "bg-emerald-500 text-white" : "bg-surface-3 text-ink-4"
                  }`}
                >
                  {s.id}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{s.name}</div>
                  <div className="text-[11.5px] text-ink-3 font-mono truncate">{s.ens}</div>
                </div>
                {isSignedOn ? (
                  <Badge variant="success" dot>
                    signed on
                  </Badge>
                ) : (
                  <span className="text-[11.5px] text-ink-4 italic">discovering…</span>
                )}
              </div>
            );
          })}
        </div>
        {phase === "ready" && (
          <div className="p-3 border-t border-border bg-surface-2 flex items-center gap-2">
            <Icon name="shield" size={14} className="text-ink-3" />
            <span className="flex-1 text-[12.5px] text-ink-2">
              Both specialists matched. Ready to begin execution.
            </span>
            <Button variant="primary" icon="play" onClick={() => setPhase("confirm")}>
              Start demo
            </Button>
          </div>
        )}
        {phase === "running" && (
          <div className="p-3 border-t border-border bg-surface-2 grid gap-2">
            <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 pulse-dot" />
              <span className="flex-1">
                Demo running — sign in to AWS in Chrome, then watch the popup terminal.
              </span>
              <span className="text-[11px] font-mono text-ink-3 tabular-nums">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
              </span>
            </div>
            <div className="text-[11.5px] text-ink-3">
              No clicks needed — we&rsquo;ll let you know when the EC2 instance is provisioned and OpenClaw is installed.
            </div>
          </div>
        )}
        {phase === "done" && (
          <div className="p-3 border-t border-border bg-surface-2 flex items-center gap-2">
            <Icon name="check" size={14} className="text-emerald-500" />
            <span className="text-[12.5px] text-ink-2">Demo complete.</span>
          </div>
        )}
      </div>

      <Modal open={phase === "confirm"} onClose={() => setPhase("ready")}>
        <div className="grid gap-3.5">
          <div className="flex items-center gap-2">
            <Icon name="shield" size={16} />
            <h3 className="text-[15px] font-semibold">Confirm execution</h3>
          </div>
          <p className="text-[13px] text-ink-2">
            Both specialists will run the following on your machine and in your AWS account. Sign
            in to AWS in your browser when the page opens — no other clicks needed; we&rsquo;ll
            tell you when it&rsquo;s done.
          </p>
          <ol className="grid gap-1.5">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] text-ink-2">
                <span className="w-5 h-5 rounded-full bg-surface-3 text-ink-3 grid place-items-center text-[11px] font-mono shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="text-[11.5px] text-ink-3 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            This will provision real resources in your AWS account. The instance is left running
            unless you set <span className="font-mono">TERMINATE=1</span>.
          </div>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              {error}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button variant="primary" icon="play" onClick={start} disabled={busy}>
              {busy ? "Starting…" : "Start"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={phase === "done"} onClose={() => setPhase("done")}>
        <div className="grid gap-3.5">
          <div className="flex items-center gap-2">
            <Icon name="check" size={18} className="text-emerald-500" />
            <h3 className="text-[15px] font-semibold">Demo complete</h3>
          </div>
          <p className="text-[13px] text-ink-2">
            Your EC2 instance is running, OpenClaw is installed, and the bot should be online.
            Open Telegram and message{" "}
            <a
              href="https://t.me/RightHandAI_OpenClaw"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-700 underline"
            >
              @RightHandAI_OpenClaw
            </a>{" "}
            to chat with it.
          </p>
          <div className="text-[11.5px] text-ink-3 bg-surface-2 border border-border px-3 py-2 rounded">
            Don&rsquo;t forget to terminate the instance when done:{" "}
            <span className="font-mono">aws ec2 terminate-instances --instance-ids i-...</span>
          </div>
          <div className="flex justify-end pt-1">
            <Button variant="primary" onClick={() => setPhase("done")}>
              Got it
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

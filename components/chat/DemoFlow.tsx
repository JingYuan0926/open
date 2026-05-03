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
  | "introducing"      // searching loading + reveal animation
  | "ready"            // both accepted, waiting for user
  | "confirm"          // review steps before kicking off execution
  | "running"          // demo executing
  | "done";

const RUNNING_TIMEOUT_MS = 30_000;

// ENS lookup link — server returns JSON with all six text records + addr.
function ensLink(name: string): string {
  return `/api/ens/read-specialist?name=${encodeURIComponent(name)}`;
}

export function DemoFlow({ taskLabel }: { taskLabel: string }) {
  const taskEns = `${taskLabel}.righthand.eth`;

  const [phase, setPhase] = React.useState<Phase>("introducing");
  const [signedOn, setSignedOn] = React.useState<typeof SPECIALISTS>([]);
  // While true, show a loading "discovering on the mesh" pane instead of
  // the specialist rows. Flips to false once results land.
  const [searching, setSearching] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // 1) Searching state for ~2s ("discovering specialists on the mesh").
  // 2) Reveal specialists one-by-one as they "accept".
  // 3) Flip to ready.
  React.useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setSearching(false), 2200));
    timers.push(setTimeout(() => setSignedOn([SPECIALISTS[0]]), 2900));
    timers.push(setTimeout(() => setSignedOn(SPECIALISTS), 3800));
    timers.push(setTimeout(() => setPhase("ready"), 4200));
    return () => timers.forEach(clearTimeout);
  }, []);

  // Auto-finish after 30 s once running.
  React.useEffect(() => {
    if (phase !== "running") return;
    const t = setTimeout(() => setPhase("done"), RUNNING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const onClickStartNow = () => {
    setError(null);
    setPhase("confirm");
  };

  const onClickStartExecution = () => {
    setError(null);
    setPhase("running");
  };

  return (
    <>
      <div className="my-2 border border-border-strong bg-white rounded-md overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border text-[12px] font-medium text-ink-2 uppercase tracking-wider">
          <Icon name="users" size={14} />
          Specialists accepted
          <span className="ml-auto text-[11px] font-medium text-ink-3 normal-case tracking-normal">
            for{" "}
            <a
              href={ensLink(taskEns)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-700 hover:underline"
              title="Show ENS records"
            >
              {taskEns}
            </a>
          </span>
        </div>
        <div className="p-3 grid gap-2">
          {searching ? (
            <div className="grid gap-2">
              <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-border bg-surface-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 pulse-dot shrink-0" />
                <div className="flex-1 text-[12.5px] text-ink-2">
                  Discovering matching specialists on the AXL mesh…
                </div>
                <span className="text-[11px] text-ink-4 font-mono">querying ENS</span>
              </div>
              {/* Skeleton placeholder rows so the box height doesn't jump
                  when the real specialists land. */}
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-dashed border-border bg-surface-2/50"
                >
                  <div className="w-7 h-7 rounded-md bg-surface-3 animate-pulse shrink-0" />
                  <div className="flex-1 grid gap-1">
                    <div className="h-3 rounded bg-surface-3 animate-pulse w-2/3" />
                    <div className="h-2.5 rounded bg-surface-3 animate-pulse w-1/2" />
                  </div>
                  <span className="text-[11px] text-ink-4 italic shrink-0">searching…</span>
                </div>
              ))}
            </div>
          ) : (
            SPECIALISTS.map((s) => {
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
                    <a
                      href={ensLink(s.ens)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11.5px] text-blue-700 font-mono truncate hover:underline block"
                      title="Show ENS records"
                    >
                      {s.ens}
                    </a>
                  </div>
                  {isSignedOn ? (
                    <Badge variant="success" dot>
                      accepted task
                    </Badge>
                  ) : (
                    <span className="text-[11.5px] text-ink-4 italic">candidate found</span>
                  )}
                </div>
              );
            })
          )}
        </div>
        {phase === "ready" && (
          <div className="p-3 border-t border-border bg-surface-2 flex items-center gap-2">
            <Icon name="shield" size={14} className="text-ink-3" />
            <span className="flex-1 text-[12.5px] text-ink-2">
              Both specialists matched. Ready to begin execution.
            </span>
            <Button variant="primary" icon="play" onClick={onClickStartNow}>
              Start Now
            </Button>
          </div>
        )}
        {phase === "running" && (
          <div className="p-3 border-t border-border bg-surface-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 pulse-dot" />
            <span className="text-[12.5px] text-ink-2">AI agents are taking over the process…</span>
          </div>
        )}
      </div>

      {phase === "done" && (
        <div className="my-2 border border-border-strong bg-white rounded-md overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border text-[12px] font-medium text-ink-2 uppercase tracking-wider">
            <Icon name="check" size={14} className="text-emerald-500" />
            Finished
          </div>
          <div className="p-3 text-[13.5px] text-ink-2 leading-relaxed">
            The process is done. Let me know if there&rsquo;s anything else I can help with.
          </div>
        </div>
      )}

      {/* Confirm — review steps and start. No payment here; budget was
          already escrowed on Sepolia by Pay & Post. */}
      <Modal open={phase === "confirm"} onClose={() => setPhase("ready")}>
        <div className="grid gap-3.5">
          <div className="flex items-center gap-2">
            <Icon name="shield" size={16} />
            <h3 className="text-[15px] font-semibold">Confirm execution</h3>
          </div>
          <p className="text-[13px] text-ink-2">
            Both specialists will run the following on your machine and in your AWS account.
            Sign in to AWS in your browser when the page opens — no other clicks needed.
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
            This will provision real resources in your AWS account. The instance
            is left running unless you set <span className="font-mono">TERMINATE=1</span>.
          </div>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 break-words">
              {error}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button variant="primary" icon="play" onClick={onClickStartExecution}>
              Start
            </Button>
          </div>
        </div>
      </Modal>

      {/* Running */}
      <Modal open={phase === "running"}>
        <div className="grid gap-3.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 pulse-dot" />
            <h3 className="text-[15px] font-semibold">AI agents are taking over</h3>
          </div>
          <p className="text-[13px] text-ink-2">
            The specialists are provisioning your EC2 instance and installing OpenClaw on it now.
            Please be patient — no clicks needed here. We&rsquo;ll tell you when it&rsquo;s done.
          </p>
          <p className="text-[12.5px] text-ink-3">
            A Chrome tab opened to the AWS sign-in page; sign in there at your own pace. The
            agents are working in parallel in a separate terminal window.
          </p>
        </div>
      </Modal>
    </>
  );
}

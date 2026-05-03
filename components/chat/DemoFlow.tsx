"use client";

import * as React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

type SpecialistRow = {
  id: string;
  name: string;
  ens: string;
  role: string;
  // Wallet that receives the per-call royalty. Real /api/x402/pay-agent
  // endpoint forwards the USDC there. For the demo both point at the
  // deployer wallet — a real product would pull this from each iNFT
  // owner / ENS `addr` record.
  ownerAddress: string;
  priceOG: string;
};

const SPECIALISTS: SpecialistRow[] = [
  {
    id: "AW",
    name: "AWS Provisioning Specialist",
    ens: "aws-provision.righthand.eth",
    role: "Provision",
    ownerAddress: "0x9787cfF89D30bB6Ae87Aaad9B3a02E77B5caA8f1",
    priceOG: "0.001",
  },
  {
    id: "OC",
    name: "OpenClaw Deployment Specialist",
    ens: "openclaw-deploy.righthand.eth",
    role: "Deploy",
    ownerAddress: "0x9787cfF89D30bB6Ae87Aaad9B3a02E77B5caA8f1",
    priceOG: "0.001",
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
  | "introducing"      // animating specialists accepting
  | "ready"            // both accepted, waiting for user
  | "axl-prompt"       // AXL not detected — must download first
  | "axl-downloading"  // mocked progress
  | "confirm"          // review steps + Pay & Continue
  | "paying"           // x402 pay each specialist sequentially
  | "paid"             // both paid; show tx hashes; awaiting OK
  | "running"          // demo executing
  | "done";

const RUNNING_TIMEOUT_MS = 30_000;
const AXL_DOWNLOAD_MS = 1800;
const AXL_LS_KEY = "rh:axl-downloaded";

type PaymentResult = {
  specialist: SpecialistRow;
  txHash: string;
  amount: string;
  payTo: string;
  explorerUrl: string;
};

// ENS lookup link — server returns JSON with all six text records + addr.
// Opens in a new tab so the chat keeps its place.
function ensLink(name: string): string {
  return `/api/ens/read-specialist?name=${encodeURIComponent(name)}`;
}

// Inline USDC-style mark: blue circle with "$" inside. Recognisable
// without bundling the actual Circle SVG.
function UsdcIcon({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center bg-[#2775CA] text-white rounded-full font-bold align-middle shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, size - 4),
        lineHeight: 1,
      }}
    >
      $
    </span>
  );
}

// Strip-down, inline x402 payment to one agent. Same wire format as
// lib/x402/payAgent.ts but returns the result directly so we can call it
// twice in a row from a single async handler.
async function payAgentOnce(input: {
  agentName: string;
  ownerAddress: string;
  priceOG: string;
}): Promise<{ txHash: string; amount: string; payTo: string; explorerUrl: string }> {
  const r1 = await fetch("/api/x402/pay-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (r1.status !== 402) {
    throw new Error(`Expected 402 from x402 endpoint, got ${r1.status}`);
  }
  const j1 = await r1.json();
  const accept = j1.accepts?.[0];
  if (!accept) throw new Error("402 response missing 'accepts'");

  const xPayment = btoa(
    JSON.stringify({
      x402Version: 1,
      scheme: "native",
      network: "0g-galileo-testnet",
      payload: {
        confirm: true,
        payTo: accept.payTo,
        amount: accept.maxAmountRequired,
        agentName: input.agentName,
      },
    }),
  );

  const r2 = await fetch("/api/x402/pay-agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": xPayment,
    },
    body: JSON.stringify(input),
  });
  const j2 = await r2.json();
  if (!r2.ok || !j2.success) {
    throw new Error(j2.error || `HTTP ${r2.status}`);
  }
  return {
    txHash: j2.txHash as string,
    amount: j2.amount as string,
    payTo: j2.payTo as string,
    explorerUrl: j2.explorerUrl as string,
  };
}

function shortHash(h: string) {
  if (!h || h.length < 16) return h;
  return `${h.slice(0, 10)}…${h.slice(-8)}`;
}

export function DemoFlow({ taskLabel }: { taskLabel: string }) {
  const taskEns = `${taskLabel}.righthand.eth`;

  const [phase, setPhase] = React.useState<Phase>("introducing");
  const [signedOn, setSignedOn] = React.useState<typeof SPECIALISTS>([]);
  // While true, show a loading "discovering on the mesh" pane instead of
  // the specialist rows. Flips to false once results land.
  const [searching, setSearching] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [axlDownloaded, setAxlDownloaded] = React.useState(false);
  const [payments, setPayments] = React.useState<PaymentResult[]>([]);
  const [paymentTarget, setPaymentTarget] = React.useState<string | null>(null);

  // Read AXL-downloaded flag once on mount (mocked, persisted in localStorage).
  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(AXL_LS_KEY);
      if (v === "1") setAxlDownloaded(true);
    } catch {
      /* SSR / private mode — fine, just stays false */
    }
  }, []);

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
    if (!axlDownloaded) {
      setPhase("axl-prompt");
      return;
    }
    setPhase("confirm");
  };

  const onClickDownloadAxl = () => {
    setPhase("axl-downloading");
    // Mocked — no real download. Wait, mark flag, advance to confirm.
    setTimeout(() => {
      try {
        window.localStorage.setItem(AXL_LS_KEY, "1");
      } catch {
        /* fine */
      }
      setAxlDownloaded(true);
      setPhase("confirm");
    }, AXL_DOWNLOAD_MS);
  };

  const onClickPayAndContinue = async () => {
    setError(null);
    setPayments([]);
    setPhase("paying");
    try {
      const results: PaymentResult[] = [];
      for (const s of SPECIALISTS) {
        setPaymentTarget(s.name);
        const r = await payAgentOnce({
          agentName: s.name,
          ownerAddress: s.ownerAddress,
          priceOG: s.priceOG,
        });
        results.push({ specialist: s, ...r });
        setPayments([...results]);
      }
      setPaymentTarget(null);
      setPhase("paid");
    } catch (err) {
      setPaymentTarget(null);
      setError(err instanceof Error ? err.message : String(err));
      setPhase("confirm");
    }
  };

  const onClickProceedToRun = () => {
    setError(null);
    setPhase("running");
  };

  const totalUsdc = payments
    .reduce((acc, p) => acc + Number(p.amount || 0), 0)
    .toString();

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
        {payments.length > 0 && (phase === "paid" || phase === "running" || phase === "done") && (
          <div className="px-3 py-2.5 border-t border-border bg-surface-2 grid gap-1">
            <div className="text-[11px] uppercase tracking-wide text-ink-3">
              Payments settled
            </div>
            {payments.map((p) => (
              <div key={p.txHash} className="text-[12px] text-ink-2 flex items-center gap-2 flex-wrap">
                <span className="font-medium">{p.specialist.name}:</span>
                <span className="inline-flex items-center gap-1 font-mono">
                  {p.amount} <UsdcIcon size={11} /> USDC
                </span>
                <span>·</span>
                <span className="text-ink-3">Transaction hash:</span>
                <a
                  href={p.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-700 hover:underline break-all"
                >
                  {shortHash(p.txHash)}
                </a>
              </div>
            ))}
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

      {/* AXL not downloaded prompt */}
      <Modal open={phase === "axl-prompt"} onClose={() => setPhase("ready")}>
        <div className="grid gap-3.5">
          <div className="flex items-center gap-2">
            <Icon name="alert" size={16} className="text-amber-600" />
            <h3 className="text-[15px] font-semibold">AXL node not running</h3>
          </div>
          <p className="text-[13px] text-ink-2">
            The swarm coordinates over the AXL P2P mesh. Your machine needs the
            AXL node running locally before agents can reach in. Without it,
            this <em>can&rsquo;t work</em>.
          </p>
          <p className="text-[12.5px] text-ink-3">
            One-time install — under a minute. Bundles a local AXL daemon + MCP
            servers + permission UI.
          </p>
          <div className="flex justify-end pt-1">
            <Button variant="primary" icon="arrow-up-right" onClick={onClickDownloadAxl}>
              Download AXL node
            </Button>
          </div>
        </div>
      </Modal>

      {/* AXL mocked download progress */}
      <Modal open={phase === "axl-downloading"}>
        <div className="grid gap-3.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 pulse-dot" />
            <h3 className="text-[15px] font-semibold">Downloading AXL node…</h3>
          </div>
          <p className="text-[12.5px] text-ink-3">
            Fetching the connector binary, generating an ed25519 keypair, peering
            with Gensyn&rsquo;s public bootstrap nodes.
          </p>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: "100%", animation: `axlBar ${AXL_DOWNLOAD_MS}ms linear` }}
            />
          </div>
          <style jsx>{`
            @keyframes axlBar {
              from { width: 0%; }
              to { width: 100%; }
            }
          `}</style>
        </div>
      </Modal>

      {/* Confirm + payment */}
      <Modal open={phase === "confirm"} onClose={() => setPhase("ready")}>
        <div className="grid gap-3.5">
          <div className="flex items-center gap-2">
            <Icon name="shield" size={16} />
            <h3 className="text-[15px] font-semibold">Confirm execution</h3>
          </div>
          <p className="text-[13px] text-ink-2">
            Both specialists will run the following on your machine and in your AWS account.
            Pay each their per-call royalty, then we&rsquo;ll begin.
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
          <div className="rounded-md border border-border bg-surface-2 p-3 grid gap-1 text-[12.5px] text-ink-2">
            {SPECIALISTS.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <span>{s.name}</span>
                <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                  {s.priceOG} <UsdcIcon size={12} /> USDC
                </span>
              </div>
            ))}
          </div>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 break-words">
              {error}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button variant="primary" icon="send" onClick={onClickPayAndContinue}>
              Pay & Start
            </Button>
          </div>
        </div>
      </Modal>

      {/* Paying — x402 in flight */}
      <Modal open={phase === "paying"}>
        <div className="grid gap-3.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 pulse-dot" />
            <h3 className="text-[15px] font-semibold">Settling payments</h3>
          </div>
          <p className="text-[13px] text-ink-2">
            {paymentTarget
              ? `Paying ${paymentTarget}…`
              : "Routing per-call royalties to each specialist."}
          </p>
          <div className="grid gap-1.5">
            {SPECIALISTS.map((s) => {
              const done = payments.find((p) => p.specialist.id === s.id);
              const inFlight = paymentTarget === s.name;
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2 text-[12.5px] text-ink-2"
                >
                  <span className={`w-2 h-2 rounded-full ${done ? "bg-emerald-500" : inFlight ? "bg-amber-500 pulse-dot" : "bg-surface-3"}`} />
                  <span className="flex-1">{s.name}</span>
                  {done && (
                    <span className="font-mono text-blue-700 truncate max-w-[160px]">
                      {shortHash(done.txHash)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Paid — show tx hashes + OK */}
      <Modal open={phase === "paid"}>
        <div className="grid gap-3.5">
          <div className="flex items-center gap-2">
            <Icon name="check" size={16} className="text-emerald-500" />
            <h3 className="text-[15px] font-semibold">Payments confirmed</h3>
          </div>
          <p className="text-[13px] text-ink-2">
            Each specialist&rsquo;s royalty is on chain. Total{" "}
            <span className="font-mono">
              {totalUsdc} <UsdcIcon size={11} /> USDC
            </span>{" "}
            settled.
          </p>
          <div className="rounded-md border border-border bg-surface-2 p-3 grid gap-2">
            {payments.map((p) => (
              <div key={p.txHash} className="grid gap-0.5">
                <div className="text-[12.5px] font-medium text-ink">
                  {p.specialist.name}
                </div>
                <div className="text-[11.5px] text-ink-3">
                  Transaction hash:{" "}
                  <a
                    href={p.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-700 hover:underline break-all"
                  >
                    {p.txHash}
                  </a>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-1">
            <Button variant="primary" icon="play" onClick={onClickProceedToRun}>
              OK — start execution
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

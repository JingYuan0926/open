import { useState, type ReactNode } from "react";
import { useRouter } from "next/router";

type IconProps = { className?: string; size?: number; strokeWidth?: number };

const Icon = ({ children, className = "", size = 20, strokeWidth = 1.75 }: IconProps & { children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

const HandIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 11V6a2 2 0 1 0-4 0" />
    <path d="M14 10V4a2 2 0 1 0-4 0v2" />
    <path d="M10 10.5V6a2 2 0 1 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </Icon>
);
const SearchIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>
);
const ListIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Icon>
);
const PencilIcon = (p: IconProps) => (
  <Icon {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" /></Icon>
);
const BarChartIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 20V10M18 20V4M6 20v-6" /></Icon>
);
const ShieldIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></Icon>
);
const FileIcon = (p: IconProps) => (
  <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></Icon>
);
const CheckIcon = (p: IconProps) => (
  <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>
);
const CheckCircleIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></Icon>
);
const UsersIcon = (p: IconProps) => (
  <Icon {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Icon>
);
const NetworkIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" /></Icon>
);
const ZapIcon = (p: IconProps) => (
  <Icon {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" /></Icon>
);
const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}><path d="M5 12h14M12 5l7 7-7 7" /></Icon>
);
const SparkleIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></Icon>
);

type DiagCardProps = {
  top: string;
  left: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  emphasis?: boolean;
};

const DiagCard = ({ top, left, icon, title, subtitle, emphasis }: DiagCardProps) => (
  <div
    className="absolute z-10"
    style={{ top, left, transform: "translate(-50%, -50%)" }}
  >
    <div
      className={`bg-surface rounded-2xl px-4 py-3.5 border border-border text-center min-w-[145px] ${
        emphasis ? "shadow-md" : "shadow-sm"
      }`}
    >
      <div className="flex justify-center mb-1.5 text-ink">{icon}</div>
      <div className="font-semibold text-sm text-ink">{title}</div>
      <div className="text-2xs text-ink-3 mt-0.5">{subtitle}</div>
    </div>
  </div>
);

function OrchestratorDiagram() {
  return (
    <div className="relative w-full max-w-[620px] aspect-square mx-auto">
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        overflow="visible"
        aria-hidden
      >
        <g stroke="#D1D5DB" strokeWidth="0.25" strokeDasharray="0.7 0.7" fill="none">
          <line x1="50" y1="50" x2="50" y2="16" />
          <line x1="50" y1="50" x2="20" y2="38" />
          <line x1="50" y1="50" x2="80" y2="38" />
          <line x1="50" y1="50" x2="20" y2="62" />
          <line x1="50" y1="50" x2="80" y2="62" />
          <line x1="50" y1="50" x2="50" y2="84" />
          <line x1="50" y1="50" x2="113" y2="50" />
        </g>
      </svg>

      <DiagCard top="50%" left="50%" emphasis icon={<HandIcon size={30} />} title="Right Hand AI" subtitle="Orchestrator" />
      <DiagCard top="16%" left="50%" icon={<SearchIcon />} title="Research AI" subtitle="Gathers information" />
      <DiagCard top="38%" left="20%" icon={<ListIcon />} title="Planner AI" subtitle="Breaks down the task" />
      <DiagCard top="38%" left="80%" icon={<PencilIcon />} title="Writer AI" subtitle="Creates content" />
      <DiagCard top="62%" left="20%" icon={<BarChartIcon />} title="Analyst AI" subtitle="Analyzes data" />
      <DiagCard top="62%" left="80%" icon={<ShieldIcon />} title="Reviewer AI" subtitle="Checks quality" />
      <DiagCard top="84%" left="50%" icon={<FileIcon />} title="Summarizer AI" subtitle="Summarizes the output" />

      <div className="absolute z-10" style={{ top: "50%", left: "115%", transform: "translate(-50%, -50%)" }}>
        <div className="bg-surface rounded-2xl px-4 py-3.5 border border-border shadow-sm text-center min-w-[120px]">
          <div className="flex justify-center mb-1.5 w-9 h-9 mx-auto rounded-full bg-ink text-white items-center">
            <CheckIcon size={18} />
          </div>
          <div className="font-semibold text-sm">Task</div>
          <div className="font-semibold text-sm">Completed</div>
        </div>
      </div>
    </div>
  );
}

type FeatureProps = { icon: ReactNode; title: string; desc: string };

const Feature = ({ icon, title, desc }: FeatureProps) => (
  <div className="bg-surface rounded-2xl p-6 border border-border">
    <div className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-ink-2 mb-5">
      {icon}
    </div>
    <h3 className="font-semibold text-base mb-2">{title}</h3>
    <p className="text-sm text-ink-3 leading-relaxed">{desc}</p>
  </div>
);

const TrustLogo = ({ icon, name }: { icon: ReactNode; name: string }) => (
  <div className="flex items-center gap-2 text-ink-3">
    <span className="text-ink-4">{icon}</span>
    <span className="text-sm font-medium">{name}</span>
  </div>
);

export default function Home() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openModal() {
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    setConnectError(null);
  }

  async function handleConnectWallet() {
    if (step1Done || connecting) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const eth = (typeof window !== "undefined") ? (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum : undefined;
      if (!eth) {
        setConnectError("No wallet detected. Install MetaMask.");
        return;
      }
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) setStep1Done(true);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  const AXL_CLONE_CMD = "git clone https://github.com/gensyn-ai/axl.git\ncd axl && go build ./cmd/node";

  async function handleCopyAxl() {
    if (step2Done) return;
    try {
      await navigator.clipboard.writeText(AXL_CLONE_CMD);
    } catch {
      // clipboard may be unavailable — still mark complete
    }
    setStep2Done(true);
  }

  async function handleNext() {
    if (busy || !step1Done || !step2Done) return;
    setBusy(true);
    try {
      await fetch("/api/clicks", { method: "POST" });
    } catch {
      // still navigate
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem("rh_chat_unlocked", "true");
    }
    router.push("/chat");
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <section className="px-4 sm:px-6 lg:px-12 pt-14 sm:pt-20 lg:pt-28 pb-16 sm:pb-20 lg:pb-24">
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          <div className="lg:pl-8">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-surface border border-border rounded-full text-xs text-ink-2">
              <SparkleIcon size={14} />
              Multiple AI. One purpose.
            </span>
            <h1 className="mt-5 sm:mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">Right Hand AI</h1>
            <p className="mt-5 sm:mt-6 text-2xl sm:text-3xl lg:text-[2.5rem] text-ink-3 leading-tight font-medium">
              Multiple AI agents.<br />
              Working together.<br />
              One goal achieved.
            </p>
            <p className="mt-5 sm:mt-6 text-sm sm:text-base text-ink-3 max-w-md leading-relaxed">
              Right Hand AI connects specialized AI agents, orchestrates their collaboration, and delivers results—faster, smarter, and seamlessly.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={openModal}
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-fg rounded-xl font-medium hover:opacity-90"
              >
                Get Started
                <ArrowRightIcon size={16} />
              </button>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-3">
              <span className="inline-flex items-center gap-1.5"><CheckCircleIcon size={14} /> No credit card</span>
              <span className="inline-flex items-center gap-1.5"><ZapIcon size={14} /> Free to start</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircleIcon size={14} /> Cancel anytime</span>
            </div>
          </div>

          <div className="hidden lg:block lg:-translate-x-24">
            <OrchestratorDiagram />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-12 py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-sm text-ink-3">Built for the future of work</p>
            <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
              AI agents working together, just like a team
            </h2>
          </div>
          <div className="mt-10 sm:mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Feature
              icon={<UsersIcon />}
              title="Collaborative AI"
              desc="Specialized AI agents collaborate like a real team to get the job done."
            />
            <Feature
              icon={<NetworkIcon />}
              title="Smart Orchestration"
              desc="Right Hand AI orchestrates the best agent workflow for every task."
            />
            <Feature
              icon={<ZapIcon />}
              title="Faster Results"
              desc="Parallel execution and seamless handoffs deliver results faster."
            />
            <Feature
              icon={<ShieldIcon />}
              title="Reliable & Secure"
              desc="Enterprise-grade security and reliability you can count on."
            />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-12 pb-16 sm:pb-20 lg:pb-24">
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto">
          <div className="bg-surface-3 rounded-3xl p-6 sm:p-10 lg:p-14 grid lg:grid-cols-2 gap-6 lg:gap-8 items-center relative overflow-hidden">
            <div>
              <span className="inline-flex items-center px-3 py-1.5 bg-surface border border-border rounded-full text-xs">
                Get started in minutes
              </span>
              <h2 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                Your right hand,<br />
                powered by AI.
              </h2>
            </div>
            <div className="relative z-10">
              <p className="text-sm sm:text-base text-ink-3 mb-6 max-w-md">
                Let Right Hand AI handle the work so you can focus on what matters most.
              </p>
              <button
                onClick={openModal}
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-fg rounded-xl font-medium hover:opacity-90"
              >
                Get Started for Free
                <ArrowRightIcon size={16} />
              </button>
            </div>
            <div className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 opacity-90 hidden md:block">
              <div className="w-36 h-36 md:w-44 md:h-44 lg:w-56 lg:h-56 rounded-full bg-surface-2 border border-border flex items-center justify-center text-ink-2">
                <HandIcon size={120} strokeWidth={1.25} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="px-4 sm:px-6 lg:px-12 py-12 sm:py-16 border-t border-border">
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto text-center">
          <p className="text-xs tracking-[0.2em] text-ink-3 mb-8">TRUSTED BY INNOVATIVE TEAMS</p>
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-4 items-center">
            <TrustLogo icon={<SparkleIcon size={18} />} name="Acme Inc." />
            <TrustLogo icon={<ShieldIcon size={18} />} name="Vertex" />
            <TrustLogo icon={<NetworkIcon size={18} />} name="Nexus" />
            <TrustLogo icon={<BarChartIcon size={18} />} name="Flowtype" />
            <TrustLogo icon={<FileIcon size={18} />} name="Cloudly" />
            <TrustLogo icon={<CheckCircleIcon size={18} />} name="Pioneer" />
          </div>
        </div>
      </footer>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-surface rounded-3xl border border-border shadow-md w-full max-w-lg p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-xl font-bold">Get Started</h2>
              <button
                onClick={closeModal}
                disabled={busy}
                className="text-ink-3 hover:text-ink p-1 -m-1 disabled:opacity-50"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-ink-3 mb-5">Complete these 2 steps to continue.</p>

            <div className={`rounded-2xl border p-4 mb-3 ${step1Done ? "border-border bg-surface-2" : "border-border bg-surface"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${step1Done ? "bg-ink text-white" : "bg-surface-3 text-ink-2 border border-border"}`}>
                    {step1Done ? <CheckIcon size={14} /> : "1"}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Connect Wallet</div>
                    <div className="text-xs text-ink-3 mt-0.5">Link your Ethereum wallet to continue.</div>
                    {connectError && <div className="text-xs text-red-600 mt-1">{connectError}</div>}
                  </div>
                </div>
                <button
                  onClick={handleConnectWallet}
                  disabled={step1Done || connecting}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium ${step1Done ? "bg-surface-3 text-ink-3 cursor-default" : "bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50"}`}
                >
                  {step1Done ? "Connected" : connecting ? "Connecting…" : "Connect"}
                </button>
              </div>
            </div>

            <div className={`rounded-2xl border p-4 mb-6 ${step2Done ? "border-border bg-surface-2" : "border-border bg-surface"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${step2Done ? "bg-ink text-white" : "bg-surface-3 text-ink-2 border border-border"}`}>
                    {step2Done ? <CheckIcon size={14} /> : "2"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">Clone AXL files</div>
                    <div className="text-xs text-ink-3 mt-0.5">Run these commands in your terminal:</div>
                  </div>
                </div>
                <button
                  onClick={handleCopyAxl}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium ${step2Done ? "bg-surface-3 text-ink-3 cursor-default" : "bg-accent text-accent-fg hover:opacity-90"}`}
                >
                  {step2Done ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="mt-3 ml-10 bg-surface-3 rounded-lg px-3 py-2.5 font-mono text-2xs text-ink overflow-x-auto whitespace-pre">
                <div><span className="text-ink-3 select-none">$ </span>git clone https://github.com/gensyn-ai/axl.git</div>
                <div><span className="text-ink-3 select-none">$ </span>cd axl && go build ./cmd/node</div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleNext}
                disabled={!step1Done || !step2Done || busy}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-accent-fg rounded-xl font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "Continuing…" : "Next"}
                <ArrowRightIcon size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import type { HostedAgent, Invocation, ExamplePrompt, Mode } from "@/types";

export const HOSTED_AGENTS: HostedAgent[] = [
  {
    id: "openclaw-setup", initials: "OC", name: "OpenClaw Setup Specialist", skill: "Project bootstrap & scaffolding",
    description: "Bootstraps OpenClaw projects, scaffolds sample agents, runs the verification suite, and confirms the dev loop works end-to-end before handing off.",
    status: "online", skills: ["bootstrap","openclaw","node","samples"], pricePerCall: "$0.18", rating: 4.9, callsToday: 142,
    successRate: 98.6, earnings: "$1,284.50", owner: "you.eth", ens: "openclaw-setup.righthand.eth",
    axlPubkey: "axl1q7v3...8fhx2k", storageUri: "0g://ws/agents/openclaw-setup/v3", inft: "iNFT #4821",
    runtime: "Node 20 · isolated VM · us-east", created: "Mar 14",
  },
  {
    id: "dependency", initials: "DP", name: "Dependency Specialist", skill: "Package & version resolution",
    description: "Audits dependency trees, resolves version conflicts, and proposes minimal upgrade paths. Always proposes — never installs without approval.",
    status: "online", skills: ["npm","pnpm","lockfile","audit"], pricePerCall: "$0.09", rating: 4.8, callsToday: 387,
    successRate: 99.1, earnings: "$2,140.20", owner: "you.eth", ens: "deps.righthand.eth",
    axlPubkey: "axl1f4n9...ql7w2c", storageUri: "0g://ws/agents/dependency/v7", inft: "iNFT #4822",
    runtime: "Node 20 · isolated VM · us-east", created: "Feb 02",
  },
  {
    id: "verification", initials: "VF", name: "Verification Specialist", skill: "Test runs & sanity checks",
    description: "Designs and runs the smallest verification step that proves the previous step worked.",
    status: "syncing", skills: ["tests","smoke","sanity","ci"], pricePerCall: "$0.12", rating: 4.95, callsToday: 211,
    successRate: 99.4, earnings: "$1,610.00", owner: "you.eth", ens: "verify.righthand.eth",
    axlPubkey: "axl1m2r8...zq9p3v", storageUri: "0g://ws/agents/verification/v4", inft: "iNFT #4823",
    runtime: "Node 20 · isolated VM · us-east", created: "Jan 28",
  },
  {
    id: "postgres", initials: "PG", name: "Postgres Debug Specialist", skill: "Database diagnosis & repair",
    description: "Reads logs, traces slow queries, suggests indexes, and walks through a structured triage on connection failures.",
    status: "online", skills: ["postgres","explain","indexes","logs"], pricePerCall: "$0.22", rating: 4.7, callsToday: 64,
    successRate: 96.8, earnings: "$612.40", owner: "you.eth", ens: "pg-debug.righthand.eth",
    axlPubkey: "axl1k8j2...xn4t6q", storageUri: "0g://ws/agents/postgres/v2", inft: "iNFT #4824",
    runtime: "Node 20 · isolated VM · eu-west", created: "Mar 30",
  },
  {
    id: "aws", initials: "AW", name: "AWS Config Specialist", skill: "Safe AWS configuration",
    description: "Reads, plans, and previews AWS changes with least-privilege defaults. Will not apply without approval.",
    status: "offline", skills: ["iam","vpc","s3","cloudformation"], pricePerCall: "$0.34", rating: 4.85, callsToday: 28,
    successRate: 97.2, earnings: "$904.10", owner: "you.eth", ens: "aws-config.righthand.eth",
    axlPubkey: "axl1z5w7...a2c9j1", storageUri: "0g://ws/agents/aws/v5", inft: "iNFT #4825",
    runtime: "Node 20 · isolated VM · us-east", created: "Feb 18",
  },
];

export const RECENT_INVOCATIONS: Invocation[] = [
  { task: "Install OpenClaw and run the sample agent", agent: "OpenClaw Setup Specialist", status: "completed", revenue: "$0.18", time: "2m ago" },
  { task: "Resolve react-dom peer warnings", agent: "Dependency Specialist", status: "completed", revenue: "$0.09", time: "8m ago" },
  { task: "Verify migration applied cleanly", agent: "Verification Specialist", status: "completed", revenue: "$0.12", time: "14m ago" },
  { task: "Diagnose slow /api/orders query", agent: "Postgres Debug Specialist", status: "running", revenue: "—", time: "now" },
  { task: "Preview IAM policy for staging deploy", agent: "AWS Config Specialist", status: "approval", revenue: "—", time: "1m ago" },
  { task: "Bootstrap OpenClaw with Postgres template", agent: "OpenClaw Setup Specialist", status: "completed", revenue: "$0.18", time: "31m ago" },
  { task: "Patch lockfile after vulnerability advisory", agent: "Dependency Specialist", status: "completed", revenue: "$0.09", time: "47m ago" },
];

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  { prompt: "Plan my Japan trip under $1,200", meta: "Travel · Swarm" },
  { prompt: "Configure my AWS project safely", meta: "Cloud · Pair" },
  { prompt: "Troubleshoot my PC WiFi", meta: "Local · Solo" },
  { prompt: "Install OpenClaw and run the sample agent", meta: "Dev · Swarm" },
];

export const MODES: Mode[] = [
  { id: "solo", label: "Solo", desc: "1 specialist", tradeoff: { cost: "Lowest", speed: "Fastest" }, hint: "Single specialist agent. Best for narrow, well-defined tasks." },
  { id: "pair", label: "Pair", desc: "2 specialists, cross-checking", tradeoff: { cost: "Low", speed: "Fast" }, hint: "Two specialists where one proposes and one verifies. Best for sensitive actions." },
  { id: "swarm", label: "Swarm", desc: "3–5 specialists, parallel", tradeoff: { cost: "Medium", speed: "Medium" }, hint: "Coordinator routes to multiple specialists in parallel. Best default for multi-step tasks." },
  { id: "deep", label: "Deep Swarm", desc: "5+ specialists, plan/critique/re-plan", tradeoff: { cost: "Highest", speed: "Thorough" }, hint: "Plan → critique → re-plan loop. Best for ambiguous or open-ended goals." },
];

export const NAV_USER = [
  { id: "chat", label: "Chat", icon: "chat" as const, count: null as number | null },
  { id: "tasks", label: "Tasks", icon: "tasks" as const, count: 3 },
  { id: "agents", label: "Agents", icon: "agents" as const, count: null },
  { id: "connector", label: "Connector", icon: "connector" as const, count: null },
  { id: "settings", label: "Settings", icon: "settings" as const, count: null },
];

export const NAV_HOST = [
  { id: "host", label: "Overview", icon: "dashboard" as const, count: null as number | null },
  { id: "host-agents", label: "Agents", icon: "agents" as const, count: 5 },
  { id: "host-invocations", label: "Invocations", icon: "tasks" as const, count: null },
  { id: "host-earnings", label: "Earnings", icon: "earnings" as const, count: null },
  { id: "host-settings", label: "Settings", icon: "settings" as const, count: null },
];

export const HISTORY = [
  { id: "h1", label: "Install OpenClaw and run the sample agent", active: true },
  { id: "h2", label: "Plan my Japan trip under $1,200" },
  { id: "h3", label: "Diagnose slow /api/orders query" },
  { id: "h4", label: "Preview IAM policy for staging deploy" },
  { id: "h5", label: "Resolve react-dom peer warnings" },
  { id: "h6", label: "Set up Postgres replication" },
];

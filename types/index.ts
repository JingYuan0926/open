export type AgentStatus = "online" | "offline" | "syncing";
export type ModeId = "solo" | "pair" | "swarm" | "deep";
export type RunPhase = "idle" | "routing" | "discovering" | "executing" | "approval" | "clarify" | "finishing" | "done";
export type StepStatus = "pending" | "active" | "done";
export type ApprovalStatus = "pending" | "approved" | "denied";
export type ClarifyStatus = "pending" | "answered";

export interface HostedAgent {
  id: string;
  initials: string;
  name: string;
  skill: string;
  description: string;
  status: AgentStatus;
  skills: string[];
  pricePerCall: string;
  rating: number;
  callsToday: number;
  successRate: number;
  earnings: string;
  owner: string;
  ens: string;
  axlPubkey: string;
  storageUri: string;
  inft: string;
  runtime: string;
  created: string;
}

export interface Invocation {
  task: string;
  agent: string;
  status: "completed" | "running" | "approval";
  revenue: string;
  time: string;
}

export interface ExamplePrompt { prompt: string; meta: string; }

export interface Mode {
  id: ModeId;
  label: string;
  desc: string;
  tradeoff: { cost: string; speed: string };
  hint: string;
}

export interface Specialist { id: string; name: string; role: string; state?: "queued" | "active" | "done"; }

export interface ChatStep { title: string; meta?: string; status: StepStatus; duration?: string; }

export interface ApprovalState { actor: string; command: string; status: ApprovalStatus; }

export interface ClarifyOption { label: string; description?: string; }
export interface ClarifyQuestion { id: string; question: string; options: ClarifyOption[]; }
export interface ClarifyDef {
  actor: string;
  context?: string;
  questions: ClarifyQuestion[];
}
export interface ClarifyState extends ClarifyDef {
  answers: Record<string, string>;
  status: ClarifyStatus;
}

export interface ReportState { title: string; items: string[]; }

export interface AssistantMessage {
  id: string;
  role: "assistant";
  author: string;
  intro: string;
  steps: ChatStep[];
  approval: ApprovalState | null;
  clarifies: ClarifyState[];
  report: ReportState | null;
  script: TaskScript;
  taskId: string;
}
export interface UserMessage { id: string; role: "user"; content: string; }
export type ChatMessage = UserMessage | AssistantMessage;

export interface TaskScript {
  coordinator: string;
  specialists: Specialist[];
  intro: string;
  approvalCmd: string;
  approvalActor: string;
  clarifies?: ClarifyDef[];
  reportTitle: string;
  reportItems: string[];
}

export interface RunState {
  taskId: string;
  taskTitle: string;
  phase: RunPhase;
  specialists: Specialist[];
  approvalCount: number;
  memSize: number;
  cost: string;
}

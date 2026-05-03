import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import {
  type AgentExecutor,
  DefaultRequestHandler,
  type ExecutionEventBus,
  InMemoryTaskStore,
  type RequestContext,
} from "@a2a-js/sdk/server";
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder,
} from "@a2a-js/sdk/server/express";
import type { AgentCard, Message, TextPart } from "@a2a-js/sdk";

// AXL has a bug: cmd/node/config.go applyOverrides forgets to copy A2APort,
// so a2a_port in node-config.json is ignored and AXL always forwards to its
// hardcoded default 9004. We bind here to match.
const PORT = parseInt(process.env.A2A_PORT ?? "9004");

// Read MACHINE_ROLE from .axl/role (written by setup-axl.sh).
// If absent, fall back to "echo" — preserves the original localhost demo behaviour.
function readRole(): string {
  const rolePath = resolve(".axl/role");
  if (!existsSync(rolePath)) return "echo";
  return readFileSync(rolePath, "utf8").trim() || "echo";
}

const ROLE = readRole();
const IS_USER = ROLE === "user";

const agentCard: AgentCard = IS_USER
  ? {
      name: "User",
      description: "Right-Hand AI display node. Logs incoming messages, never sends.",
      version: "0.1.0",
      protocolVersion: "0.3.0",
      url: `http://127.0.0.1:${PORT}/`,
      preferredTransport: "JSONRPC",
      capabilities: {},
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain"],
      skills: [
        {
          id: "display",
          name: "Display",
          description: "Receives CC'd conversation messages for display. ACK only.",
          tags: ["demo", "user"],
        },
      ],
    }
  : {
      name: ROLE === "echo" ? "Echo Agent" : `Right-Hand AI ${ROLE}`,
      description:
        ROLE === "echo"
          ? "Demo A2A agent. Replies with the text it receives."
          : `Right-Hand AI specialist (${ROLE}). Echoes received text and logs sender.`,
      version: "0.1.0",
      protocolVersion: "0.3.0",
      url: `http://127.0.0.1:${PORT}/`,
      preferredTransport: "JSONRPC",
      capabilities: {},
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain"],
      skills: [
        {
          id: "echo",
          name: "Echo",
          description: "Echoes the input text back, prefixed with [echo]",
          tags: ["demo"],
        },
      ],
    };

function nowIso(): string {
  return new Date().toISOString();
}

// In-memory ring of recent inbound A2A messages, exposed via GET /messages
// so a local mcp-call.ts can subscribe to live cross-machine chatter while
// it waits on a long MCP response. Pure UI plumbing.
interface RecentMessage {
  seq: number;
  ts: string;
  fromRole: string;
  text: string;
  isCc: boolean;
  isProgress: boolean;
}
const recent: RecentMessage[] = [];
let nextSeq = 1;
const MAX_RECENT = 200;

// ────────────────────────────────────────────────────────────────────────
//  Demo dialogue: role-specific auto-replies that make the swarm feel
//  alive. When agent-c sees agent-b kicking off provision, agent-c waits
//  ~10s then broadcasts "hey i got the bot token, waiting on you" — which
//  agent-b (also pattern-matching) replies to with "still provisioning,
//  almost there". Each rule fires exactly once per matching inbound
//  message; the auto-reply itself is tagged metadata.autoReply=true so it
//  cannot trigger another rule.
// ────────────────────────────────────────────────────────────────────────
interface ChatRule {
  /** Match metadata.kind ("starting" | "ack" | …) on the incoming message */
  kind?: string;
  /** Match metadata.tool — also accepts substring match on text body */
  tool?: string;
  /** Or match a regex against the text body */
  pattern?: RegExp;
  /** Only respond to messages from these sender roles */
  from: string[];
  /** Delay before broadcasting the reply (ms) */
  delayMs: number;
  /** Reply text to broadcast */
  reply: string;
}

const CHAT_RULES: Record<string, ChatRule[]> = {
  "agent-c": [
    {
      kind: "starting", tool: "aws_signin", from: ["agent-b"],
      delayMs: 1500,
      reply: "ok @agent-b, on it — fetching the Telegram bot ID + token while you log in",
    },
    {
      kind: "starting", tool: "provision_ec2", from: ["agent-b"],
      delayMs: 10_000,
      reply: "hey @agent-b — got the bot token ready, waiting on you",
    },
    {
      kind: "ack", tool: "provision_ec2", from: ["agent-b"],
      delayMs: 2000,
      reply: "got it — deploying OpenClaw onto the new EC2 box now",
    },
  ],
  "agent-b": [
    {
      pattern: /got the bot token|got the token|waiting on you/i,
      from: ["agent-c"],
      delayMs: 2000,
      reply: "still provisioning — almost there, will hand off once EC2 is up",
    },
    {
      kind: "ack", tool: "install_openclaw", from: ["agent-c"],
      delayMs: 1500,
      reply: "nice — bot's live. @user the deploy is done.",
    },
  ],
  "user": [],
};

function findMatchingRule(
  myRole: string,
  fromRole: string,
  text: string,
  meta: Record<string, unknown>,
): ChatRule | null {
  if (meta.autoReply === true) return null;     // never reply to a reply
  const rules = CHAT_RULES[myRole];
  if (!rules || rules.length === 0) return null;
  for (const rule of rules) {
    if (!rule.from.includes(fromRole)) continue;
    if (rule.kind && meta.kind !== rule.kind) continue;
    if (rule.tool) {
      const t = typeof meta.tool === "string" ? meta.tool : "";
      if (t !== rule.tool && !text.includes(rule.tool)) continue;
    }
    if (rule.pattern && !rule.pattern.test(text)) continue;
    return rule;
  }
  return null;
}

interface RawPeer { apiPort?: number; pubkey?: string; }

async function broadcastChat(text: string, fromRole: string): Promise<void> {
  let peers: Record<string, RawPeer>;
  try {
    peers = JSON.parse(readFileSync(resolve("axl/peers.json"), "utf8")) as Record<string, RawPeer>;
  } catch {
    return;
  }
  const myEntry = peers[fromRole];
  const myPort = myEntry?.apiPort ?? 9002;

  const tasks: Promise<unknown>[] = [];
  for (const [role, entry] of Object.entries(peers)) {
    if (role === fromRole) continue;
    if (!entry || typeof entry !== "object" || !entry.pubkey) continue;
    const url = `http://127.0.0.1:${myPort}/a2a/${entry.pubkey}/`;
    const body = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: `chat-reply-${Date.now()}-${role}`,
          role: "user",
          parts: [{ kind: "text", text }],
          metadata: { fromRole, autoReply: true, chat: true },
        },
      },
    };
    tasks.push(
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => undefined),
    );
  }
  await Promise.all(tasks);
}

class RoleAwareExecutor implements AgentExecutor {
  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const input = ctx.userMessage.parts
      .filter((p): p is TextPart => p.kind === "text")
      .map((p) => p.text)
      .join(" ");

    // The sender embeds their role + a "cc" flag into message metadata.
    const meta = (ctx.userMessage.metadata ?? {}) as Record<string, unknown>;
    const fromRole = typeof meta.fromRole === "string" ? meta.fromRole : "?";
    const isCc = meta.cc === true;
    const isProgress = meta.progress === true;
    const ccTag = isCc ? " (cc)" : "";

    recent.push({
      seq: nextSeq++,
      ts: nowIso(),
      fromRole,
      text: input,
      isCc,
      isProgress,
    });
    while (recent.length > MAX_RECENT) recent.shift();

    // Pretty log line with sender attribution + timestamp.
    const dim = "\x1b[2m";
    const yellow = "\x1b[1;33m";
    const cyan = "\x1b[36m";
    const reset = "\x1b[0m";
    console.log(
      `${dim}${nowIso()}${reset} ${yellow}[${fromRole}${ccTag} → ${ROLE}]${reset} ${input}`
    );

    // Demo dialogue: if a role-specific chat rule matches this inbound
    // message, schedule a delayed broadcast back out so the swarm feels
    // like a real conversation. Fire-and-forget; doesn't block the reply.
    const rule = findMatchingRule(ROLE, fromRole, input, meta);
    if (rule) {
      console.log(
        `${dim}${nowIso()}${reset} ${cyan}[chat-rule]${reset} matched ${ROLE} → reply in ${rule.delayMs}ms`,
      );
      setTimeout(() => {
        // Push our own reply into our recent ring too, so a local
        // mcp-call.ts polling /messages sees it consistently.
        recent.push({
          seq: nextSeq++,
          ts: nowIso(),
          fromRole: ROLE,
          text: rule.reply,
          isCc: false,
          isProgress: false,
        });
        while (recent.length > MAX_RECENT) recent.shift();
        broadcastChat(rule.reply, ROLE).catch((e) =>
          console.log(`[chat-rule] broadcast failed: ${e instanceof Error ? e.message : String(e)}`),
        );
      }, rule.delayMs);
    }

    // Publish a reply.
    let replyText: string;
    if (IS_USER) {
      replyText = "received";
    } else {
      replyText = `[echo] ${input}`;
    }

    const reply: Message = {
      kind: "message",
      messageId: randomUUID(),
      role: "agent",
      parts: [{ kind: "text", text: replyText }],
      contextId: ctx.contextId,
    };

    bus.publish(reply);
    bus.finished();
  }

  async cancelTask(): Promise<void> {}
}

const requestHandler = new DefaultRequestHandler(
  agentCard,
  new InMemoryTaskStore(),
  new RoleAwareExecutor()
);

const app = express();
app.use(
  "/.well-known/agent-card.json",
  agentCardHandler({ agentCardProvider: requestHandler })
);
// /messages — live tail of inbound A2A messages, used by mcp-call.ts to
// print remote progress + chatter while waiting on a long MCP response.
// `?since=<seq>` returns only messages newer than that cursor.
app.get("/messages", (req, res) => {
  const sinceRaw = (req.query.since as string) ?? "0";
  const since = parseInt(sinceRaw, 10) || 0;
  const messages = recent.filter((m) => m.seq > since);
  res.json({ messages, latestSeq: nextSeq - 1, role: ROLE });
});
app.use(
  "/",
  jsonRpcHandler({
    requestHandler,
    userBuilder: UserBuilder.noAuthentication,
  })
);

app.listen(PORT, () => {
  console.log(`[A2A] Role: ${ROLE}${IS_USER ? " (user — display only)" : ""}`);
  console.log(`[A2A] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[A2A] Agent card: http://127.0.0.1:${PORT}/.well-known/agent-card.json`);
  console.log(`[A2A] AXL forwards inbound /a2a/{peer_id} → POST http://127.0.0.1:${PORT}/`);
});

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

// Per-role colour scheme. Local role is always magenta (purple) — "me".
// Other roles get fixed colours so the same role looks the same across
// every terminal: user=green, agent-b=yellow, agent-c=blue. "Bystander"
// (cyan) is for messages directed between two OTHER roles that I just
// happen to see — like overhearing cedric tell derek to provision while
// I'm zhiwei. Tells the eye "this isn't addressed to me, I'm watching".
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  magenta: "\x1b[35m",     // me
  green: "\x1b[32m",       // user
  yellow: "\x1b[1;33m",    // agent-b
  blue: "\x1b[34m",        // agent-c
  cyan: "\x1b[1;36m",      // bystander observation
  white: "\x1b[37m",
};

function colorForRole(role: string, localRole: string): string {
  if (role === localRole) return C.magenta;
  if (role === "user") return C.green;
  if (role === "agent-b") return C.yellow;
  if (role === "agent-c") return C.blue;
  return C.white;
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
    // Note: ack:provision_ec2 → "got it, deploying" intentionally removed.
    // The "got it" handoff line is now the *first* line of install_openclaw,
    // so it fires when the install actually starts, not as a fake auto-reply.
  ],
  "agent-b": [
    {
      pattern: /got the bot token|got the token|waiting on you/i,
      from: ["agent-c"],
      delayMs: 2000,
      reply: "still provisioning — almost there, will hand off once EC2 is up",
    },
    // Note: ack:install_openclaw → "nice, bot's live" auto-reply removed.
    // The truthful "deploy complete + bot live at <url>" announcement now
    // comes from demo-openclaw.ts inner mode AFTER the SSH install +
    // openUrl actually succeeded — not from a premature mcp-call ack.
  ],
  "user": [],
};

function findMatchingRule(
  myRole: string,
  fromRole: string,
  text: string,
  meta: Record<string, unknown>,
): ChatRule | null {
  // Cap chain depth at 2 so reply-to-reply works (zhiwei → cedric → ack)
  // but we can never accidentally loop forever if a future rule pair
  // ends up self-referential.
  const replyDepth = typeof meta.replyDepth === "number" ? meta.replyDepth : 0;
  if (replyDepth >= 2) return null;
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
    // Don't skip self — looping the auto-reply through local AXL gives us
    // a [me → all] echo on this Mac's own axl:start log too.
    if (!entry || typeof entry !== "object" || !entry.pubkey) continue;
    const url = `http://127.0.0.1:${myPort}/a2a/${entry.pubkey}`;
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
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    tasks.push(
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      })
        .then((r) => {
          clearTimeout(t);
          if (!r.ok) console.log(`[chat-rule] ✗ reply to ${role} returned HTTP ${r.status}`);
        })
        .catch((err) => {
          clearTimeout(t);
          console.log(`[chat-rule] ✗ reply to ${role} failed: ${err instanceof Error ? err.message : String(err)}`);
        }),
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

    // Sender embeds their role + flags into message metadata.
    const meta = (ctx.userMessage.metadata ?? {}) as Record<string, unknown>;
    const fromRole = typeof meta.fromRole === "string" ? meta.fromRole : "?";
    const isCc = meta.cc === true;
    const isProgress = meta.progress === true;
    const isInternal = meta.internal === true;     // local-only AI narration
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

    const isSelf = fromRole === ROLE;
    const ts = nowIso();

    // Bystander = directed message between two OTHER roles that I just
    // happen to see. Distinct colour so the eye reads "I'm overhearing
    // this, not party to it".
    const directedTarget = typeof meta.target === "string" ? meta.target : null;
    const isBystander = !isSelf && directedTarget !== null && directedTarget !== ROLE;

    // Internal narration: local-only "[me] doing X" line. Skip the arrow
    // entirely — it's not a conversation, it's the AI's own monologue.
    if (isInternal) {
      console.log(`${C.dim}${ts}${C.reset} ${C.magenta}[me]${C.reset} ${input}`);
    } else if (isBystander) {
      // Observed dispatch between two other roles. Cyan, with the actual
      // sender → target labels (no "me" anywhere in the line).
      console.log(
        `${C.dim}${ts}${C.reset} ${C.cyan}[${fromRole} → ${directedTarget}]${C.reset} ${input}`,
      );
    } else {
      // Conversational line. Each role gets its own fixed colour; the
      // local role is always rendered as "me" in magenta. Directed
      // self-echoes ([me → <target>]) carry their target in metadata.
      const fromLabel = isSelf ? "me" : fromRole;
      const toLabel = isSelf ? (directedTarget ?? "all") : "me";
      const fromC = colorForRole(fromRole, ROLE);
      console.log(
        `${C.dim}${ts}${C.reset} ${fromC}[${fromLabel}${ccTag} → ${toLabel}]${C.reset} ${input}`,
      );
    }

    // Demo dialogue: if a role-specific chat rule matches this inbound
    // message, schedule a delayed broadcast back out so the swarm feels
    // like a real conversation. Skip self-echoes, internal narration,
    // and bystander observations (none of those are addressed to me).
    if (!isSelf && !isInternal && !isBystander) {
      const rule = findMatchingRule(ROLE, fromRole, input, meta);
      if (rule) {
        console.log(
          `${C.dim}${ts}${C.reset} ${C.dim}[chat-rule] matched ${ROLE} → reply in ${rule.delayMs}ms${C.reset}`,
        );
        setTimeout(() => {
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

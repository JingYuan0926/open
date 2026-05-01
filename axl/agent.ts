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
const IS_SPECTATOR = ROLE === "spectator";

const agentCard: AgentCard = IS_SPECTATOR
  ? {
      name: "Spectator",
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
          tags: ["demo", "spectator"],
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
    const ccTag = isCc ? " (cc)" : "";

    // Pretty log line with sender attribution + timestamp.
    const dim = "\x1b[2m";
    const yellow = "\x1b[1;33m";
    const cyan = "\x1b[36m";
    const reset = "\x1b[0m";
    console.log(
      `${dim}${nowIso()}${reset} ${yellow}[${fromRole}${ccTag} → ${ROLE}]${reset} ${input}`
    );

    // Publish a reply.
    let replyText: string;
    if (IS_SPECTATOR) {
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
app.use(
  "/",
  jsonRpcHandler({
    requestHandler,
    userBuilder: UserBuilder.noAuthentication,
  })
);

app.listen(PORT, () => {
  console.log(`[A2A] Role: ${ROLE}${IS_SPECTATOR ? " (spectator — display only)" : ""}`);
  console.log(`[A2A] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[A2A] Agent card: http://127.0.0.1:${PORT}/.well-known/agent-card.json`);
  console.log(`[A2A] AXL forwards inbound /a2a/{peer_id} → POST http://127.0.0.1:${PORT}/`);
});

import { randomUUID } from "node:crypto";
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

const agentCard: AgentCard = {
  name: "Echo Agent",
  description: "Demo A2A agent. Replies with the text it receives.",
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

class EchoExecutor implements AgentExecutor {
  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const input = ctx.userMessage.parts
      .filter((p): p is TextPart => p.kind === "text")
      .map((p) => p.text)
      .join(" ");

    const reply: Message = {
      kind: "message",
      messageId: randomUUID(),
      role: "agent",
      parts: [{ kind: "text", text: `[echo] ${input}` }],
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
  new EchoExecutor()
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
  console.log(`[A2A] Echo agent listening on http://127.0.0.1:${PORT}`);
  console.log(`[A2A] Agent card: http://127.0.0.1:${PORT}/.well-known/agent-card.json`);
  console.log(`[A2A] AXL forwards inbound /a2a/{peer_id} → POST http://127.0.0.1:${PORT}/`);
});

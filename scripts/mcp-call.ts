// scripts/mcp-call.ts — sender side of an MCP call across AXL.
//
// Usage:
//   npm run mcp:call -- <target-role> <service> <tool> '<json-args>'
//
// Resolves <target-role> → pubkey via axl/peers.json, builds a JSON-RPC
// envelope, POSTs to local AXL :9002/mcp/<peer-pubkey>/<service>, and prints
// the response.
//
// Convention: this terminal stays quiet. It prints the call going out, the
// result coming back, and broadcast errors only. All cross-machine chat
// lands in the axl:start terminal (agent.ts logs inbound A2A; aws.ts logs
// progress pings). To watch the conversation, look there.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
if (argv.length < 3) {
  console.error("Usage: npm run mcp:call -- <target-role> <service> <tool> [json-args]");
  process.exit(64);
}

const [targetRole, service, tool, jsonArgs] = argv;

let toolArgs: Record<string, unknown> = {};
if (jsonArgs) {
  try { toolArgs = JSON.parse(jsonArgs); }
  catch (err) {
    console.error(`Invalid JSON args: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(64);
  }
}

interface PeerEntry { apiPort: number; pubkey: string; }
const peers = JSON.parse(readFileSync(resolve("axl/peers.json"), "utf8")) as Record<string, unknown>;

const target = peers[targetRole] as PeerEntry | undefined;
if (!target?.pubkey) {
  console.error(`No pubkey for role '${targetRole}' in axl/peers.json. Run 'npm run axl:start' on that machine and pull the updated peers.json.`);
  process.exit(2);
}

let myRole = "unknown";
try { myRole = readFileSync(resolve(".axl/role"), "utf8").trim(); } catch { /* ok */ }

const myEntry = peers[myRole] as PeerEntry | undefined;
const apiPort = myEntry?.apiPort ?? 9002;

const jsonRpc = {
  jsonrpc: "2.0" as const,
  id: Date.now(),
  method: "tools/call" as const,
  params: { name: tool, arguments: toolArgs },
};

const url = `http://127.0.0.1:${apiPort}/mcp/${target.pubkey}/${service}`;

const dim = "\x1b[2m";
const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const magenta = "\x1b[35m";
const reset = "\x1b[0m";

console.log(`${dim}[mcp:call]${reset} ${cyan}${myRole}${reset} → ${yellow}${targetRole}${reset}.${service}.${tool}(${JSON.stringify(toolArgs)})`);
console.log(`${dim}[mcp:call] POST ${url}${reset}`);

// ──────────────────────────────────────────────────────────────────────
//  Broadcast helpers — silent on success. The actual chat narration is
//  rendered on remote axl:start terminals (agent.ts logs everything
//  inbound). We just send and stay quiet.
// ──────────────────────────────────────────────────────────────────────
async function broadcastA2A(text: string, kind: "starting" | "ack"): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  for (const [role, raw] of Object.entries(peers)) {
    if (role === myRole) continue;
    const entry = raw as PeerEntry | undefined;
    if (!entry?.pubkey) continue;

    const target = `http://127.0.0.1:${apiPort}/a2a/${entry.pubkey}`;
    const body = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: `${kind}-${Date.now()}-${role}`,
          role: "user",
          parts: [{ kind: "text", text }],
          metadata: { fromRole: myRole, broadcast: true, kind, tool, chat: true },
        },
      },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    tasks.push(
      fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .then((r) => {
          clearTimeout(timer);
          if (!r.ok) {
            console.log(`${dim}[mcp:call]${reset} ${magenta}✗${reset} broadcast to ${role} returned HTTP ${r.status}`);
          }
        })
        .catch((err) => {
          clearTimeout(timer);
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`${dim}[mcp:call]${reset} ${magenta}✗${reset} broadcast to ${role} failed: ${msg}`);
        }),
    );
  }
  await Promise.all(tasks);
}

// Per-tool starting/ack flavour text. Sent over A2A so other peers' axl:start
// terminals show it; not echoed locally on this terminal.
function startingText(): string {
  switch (tool) {
    case "aws_signin":
      return `hey @agent-c — let me handle the AWS login. while I do, can you grab the Telegram bot ID + token?`;
    case "provision_ec2":
      return `AWS signin done. starting EC2 provision now — t3.micro on us-east-1`;
    case "install_openclaw":
      return `got it — handoff received. starting OpenClaw deploy onto the new EC2 box`;
    default:
      return `starting ${tool}(${JSON.stringify(toolArgs)})`;
  }
}

function ackText(suffix = ""): string {
  const tag = suffix ? ` ${suffix}` : "";
  switch (tool) {
    case "aws_signin":
      return `browser is open on @user — sign in, then run mcp:demo:provision when you're ready${tag}`;
    case "provision_ec2":
      return `EC2 ready — handing off to @agent-c for the OpenClaw deploy${tag}`;
    case "install_openclaw":
      return `deploy complete! @user the Telegram bot page should be opening now${tag}`;
    default:
      return `ack ${tool}${tag}`;
  }
}

(async () => {
  // Broadcast "starting" silently — the message lands on other peers'
  // axl:start terminals via their agent.ts logs.
  await broadcastA2A(startingText(), "starting");

  // Send the MCP call.
  let res: Response | null = null;
  let networkError = "";
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jsonRpc),
    });
  } catch (err) {
    networkError = err instanceof Error ? err.message : String(err);
  }

  // Print MCP outcome.
  if (networkError) {
    console.error(`${dim}[mcp:call]${reset} ${red}✗${reset} network error: ${networkError}`);
    await broadcastA2A(ackText("(network error)"), "ack");
    process.exit(2);
  }
  if (!res!.ok) {
    const text = await res!.text();
    console.error(`${dim}[mcp:call]${reset} ${red}✗${reset} HTTP ${res!.status}: ${text}`);
    await broadcastA2A(ackText(`(transport ${res!.status})`), "ack");
    process.exit(2);
  }

  const text = await res!.text();
  let body: { response?: unknown; error?: string | null } & Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    console.error(`${dim}[mcp:call]${reset} ${red}✗${reset} non-JSON response: ${text}`);
    process.exit(2);
  }

  if (body.error) {
    console.error(`${dim}[mcp:call]${reset} ${red}✗${reset} router error: ${body.error}`);
    await broadcastA2A(ackText("(router error)"), "ack");
    process.exit(2);
  }

  const inner = (body.response ?? body) as {
    error?: { message?: string };
    result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
  };

  if (inner.error) {
    console.error(`${dim}[mcp:call]${reset} ${red}✗${reset} tool error: ${inner.error.message ?? JSON.stringify(inner.error)}`);
    await broadcastA2A(ackText("(tool error)"), "ack");
    process.exit(2);
  }

  const content = inner.result?.content?.[0]?.text;
  if (content) {
    let parsed: unknown = content;
    try { parsed = JSON.parse(content); } catch { /* not JSON, that's fine */ }
    const okFlag = (parsed as { ok?: boolean })?.ok;
    if (okFlag === false) {
      console.log(`${dim}[mcp:call]${reset} ${red}✗ done${reset}`);
    } else {
      console.log(`${dim}[mcp:call]${reset} ${green}✓ done${reset}`);
    }
    await broadcastA2A(ackText(), "ack");
    if (inner.result?.isError) process.exit(3);
  } else {
    console.log(`${dim}[mcp:call]${reset} ${green}✓ done${reset}`);
    await broadcastA2A(ackText(), "ack");
  }
})();

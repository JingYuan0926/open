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
    // Don't skip self — looping through local AXL → local agent.ts gives us
    // an "outbound echo" line on this Mac's axl:start, so each terminal
    // shows the full conversation from its own POV (own outbound + everyone
    // else's inbound).
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

// Per-tool starting/ack flavour text. Terse and self-describing — each
// role announces its OWN action, never tells another role what to do.
// Collaborative narrative emerges from independent announcements, not
// from one role directing others.
function startingText(): string {
  switch (tool) {
    case "aws_signin":
      return `starting AWS sign-in flow`;
    case "provision_ec2":
      return `starting EC2 provision — t3.micro on us-east-1`;
    case "install_openclaw":
      return `starting OpenClaw deploy onto the EC2 box`;
    default:
      return `starting ${tool}`;
  }
}

// One-shot directive sent to the *target* role (and looped to self) right
// before the broadcast / MCP call. This is the [me → user] line — "here's
// what I'm asking you to do" — that frames the work the receiver is about
// to start. Different from startingText (broadcast to everyone): this is
// addressed to one specific role.
function directiveText(): string {
  switch (tool) {
    case "aws_signin":
      return `please open the AWS sign-in flow in your browser`;
    case "provision_ec2":
      return `please provision a t3.micro EC2 instance on your AWS account`;
    case "install_openclaw":
      return `please deploy OpenClaw onto the new EC2 box via SSH`;
    default:
      return `please run ${tool}`;
  }
}

async function sendDirective(): Promise<void> {
  if (!target?.pubkey) return;
  const text = directiveText();
  const peerEntries: { role: string; pubkey: string }[] = [
    { role: targetRole, pubkey: target.pubkey },
  ];
  // Loop to self so it appears in our own axl:start as [me → <target>].
  if (myEntry?.pubkey && myRole !== targetRole) {
    peerEntries.push({ role: myRole, pubkey: myEntry.pubkey });
  }
  const tasks = peerEntries.map(({ role, pubkey }) => {
    const url = `http://127.0.0.1:${apiPort}/a2a/${pubkey}`;
    const body = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: `directive-${Date.now()}-${role}`,
          role: "user",
          parts: [{ kind: "text", text }],
          metadata: {
            fromRole: myRole,
            directed: true,
            target: targetRole,
            tool,
            chat: true,
          },
        },
      },
    };
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    }).catch(() => undefined).finally(() => clearTimeout(t));
  });
  await Promise.all(tasks);
}

function ackText(suffix = ""): string {
  const tag = suffix ? ` ${suffix}` : "";
  switch (tool) {
    case "aws_signin":
      return `AWS sign-in browser ready${tag}`;
    case "provision_ec2":
      return `EC2 provisioned and ready${tag}`;
    case "install_openclaw":
      return `OpenClaw deploy complete — Telegram bot opening on user${tag}`;
    default:
      return `${tool} done${tag}`;
  }
}

// Local-only AI narration. Sent to OUR own agent.ts (port 9004) tagged
// metadata.internal=true, so it shows up on this Mac's axl:start log as
// "[me] doing X" in purple. Not broadcast to peers.
const a2aPort = parseInt(process.env.A2A_PORT ?? "9004", 10);

async function narrate(text: string): Promise<void> {
  const url = `http://127.0.0.1:${a2aPort}/`;
  const body = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "message/send",
    params: {
      message: {
        kind: "message",
        messageId: `narrate-${Date.now()}`,
        role: "user",
        parts: [{ kind: "text", text }],
        metadata: { fromRole: myRole, internal: true },
      },
    },
  };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch {
    // local agent.ts isn't running — silent
  } finally {
    clearTimeout(t);
  }
}

(async () => {
  // Local AI monologue — shows in this Mac's axl:start as [me] in purple.
  await narrate(`dispatching ${tool} call to ${targetRole} over AXL`);

  // Directed dispatch line: [me → <target>] please do X. Lands on the
  // target's axl:start as [<sender> → me] and on our own as [me → <target>].
  await sendDirective();

  // Broadcast "starting" — lands on every peer's axl:start (including our
  // own, looped back through local AXL → local agent.ts) as [me → all].
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
      await narrate(`${tool} returned with errors`);
    } else {
      console.log(`${dim}[mcp:call]${reset} ${green}✓ done${reset}`);
      await narrate(`${tool} returned successfully`);
    }
    await broadcastA2A(ackText(), "ack");
    if (inner.result?.isError) process.exit(3);
  } else {
    console.log(`${dim}[mcp:call]${reset} ${green}✓ done${reset}`);
    await narrate(`${tool} returned`);
    await broadcastA2A(ackText(), "ack");
  }
})();

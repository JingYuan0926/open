// scripts/mcp-call.ts — sender side of an MCP call across AXL.
//
// Usage:
//   npm run mcp:call -- <target-role> <service> <tool> '<json-args>'
//
// Resolves <target-role> → pubkey via axl/peers.json, builds a JSON-RPC
// envelope, POSTs to local AXL :9002/mcp/<peer-pubkey>/<service>, and prints
// the response. AXL forwards over Yggdrasil to the receiver, which dispatches
// to its registered MCP server.
//
// While the MCP call is in flight, this also:
//   1. Broadcasts "[me] starting <tool>" via A2A to every other peer.
//   2. Polls local agent.ts /messages every 1.5s for incoming chatter
//      (progress pings from the receiver, plus anything other peers say)
//      and prints it live so the audience sees the swarm talking.
//   3. Broadcasts "[me] ack <tool>" once the response arrives.

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
const a2aPort = parseInt(process.env.A2A_PORT ?? "9004", 10);

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
const magenta = "\x1b[35m";
const reset = "\x1b[0m";

// Per-role colour so the audience can scan who's saying what.
function roleColor(role: string): string {
  if (role === myRole) return cyan;
  if (role === targetRole) return green;
  return magenta;
}

console.log(`${dim}[mcp:call]${reset} ${cyan}${myRole}${reset} → ${yellow}${targetRole}${reset}.${service}.${tool}(${JSON.stringify(toolArgs)})`);
console.log(`${dim}[mcp:call] POST ${url}${reset}`);

interface RemoteMessage {
  seq: number;
  ts: string;
  fromRole: string;
  text: string;
  isCc: boolean;
  isProgress: boolean;
}

async function broadcastA2A(text: string, kind: "starting" | "ack"): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  for (const [role, raw] of Object.entries(peers)) {
    if (role === myRole) continue;
    const entry = raw as PeerEntry | undefined;
    if (!entry?.pubkey) continue;

    const target = `http://127.0.0.1:${apiPort}/a2a/${entry.pubkey}/`;
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
          // tool is in metadata so agent.ts chat rules can match precisely.
          metadata: { fromRole: myRole, broadcast: true, kind, tool, chat: true },
        },
      },
    };
    tasks.push(
      fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => undefined),
    );
  }
  await Promise.all(tasks);
}

// Per-tool starting/ack flavour text. When a tool has special-case demo
// narration (e.g. install ends with the live bot link), it goes here.
const BOT_URL = "https://web.telegram.org/k/#@RightHandAI_NanoClawBot";

function startingText(): string {
  switch (tool) {
    case "aws_signin":
      return `[${myRole}] hey @agent-c — let me handle the AWS login. while I do, can you grab the Telegram bot ID + token?`;
    case "provision_ec2":
      return `[${myRole}] starting EC2 provision now — t3.micro on us-east-1`;
    case "install_openclaw":
      return `[${myRole}] starting OpenClaw deploy onto the new EC2 box`;
    default:
      return `[${myRole}] starting ${tool}(${JSON.stringify(toolArgs)})`;
  }
}

function ackText(suffix = ""): string {
  const tag = suffix ? ` ${suffix}` : "";
  switch (tool) {
    case "aws_signin":
      return `[${myRole}] AWS signin done${tag}`;
    case "provision_ec2":
      return `[${myRole}] EC2 ready — handing off to @agent-c for the OpenClaw deploy${tag}`;
    case "install_openclaw":
      return `[${myRole}] deploy complete! @user the bot is live at ${BOT_URL}${tag}`;
    default:
      return `[${myRole}] ack ${tool}${tag}`;
  }
}

async function fetchSince(since: number): Promise<{ messages: RemoteMessage[]; latestSeq: number } | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${a2aPort}/messages?since=${since}`);
    if (!r.ok) return null;
    return (await r.json()) as { messages: RemoteMessage[]; latestSeq: number };
  } catch {
    return null;
  }
}

function printRemote(m: RemoteMessage) {
  const c = roleColor(m.fromRole);
  const tag = m.isProgress ? "📡" : m.isCc ? "cc" : "→";
  console.log(`${dim}${m.ts.slice(11, 19)}${reset} ${c}[${m.fromRole}]${reset} ${tag} ${m.text}`);
}

(async () => {
  // Establish baseline cursor BEFORE we broadcast, so we don't replay history.
  const baseline = await fetchSince(0);
  let cursor = baseline?.latestSeq ?? 0;

  // Broadcast "starting" — flavour text per tool — and echo on our own terminal.
  const startMsg = startingText();
  console.log(`${dim}[chat]${reset} ${cyan}${startMsg}${reset}`);
  await broadcastA2A(startMsg, "starting");

  // Poll loop — runs concurrently with the MCP call. Stops when `done` is set.
  let done = false;
  const poller = (async () => {
    while (!done) {
      const r = await fetchSince(cursor);
      if (r) {
        for (const m of r.messages) printRemote(m);
        cursor = r.latestSeq;
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
    // Drain a final round so we catch the receiver's "done" ping.
    const last = await fetchSince(cursor);
    if (last) for (const m of last.messages) printRemote(m);
  })();

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

  // After the MCP call returns (or fails), give the poller ~3s of grace
  // to catch the final "done" progress ping that fires shortly after.
  await new Promise((res) => setTimeout(res, 3000));
  done = true;
  await poller;

  // Now print the MCP response (or the network/HTTP error).
  if (networkError) {
    console.error(`\n${dim}[mcp:call]${reset} network error: ${networkError}`);
    await broadcastA2A(ackText("(network error)"), "ack");
    process.exit(2);
  }
  if (!res!.ok) {
    const text = await res!.text();
    console.error(`\n${dim}[mcp:call]${reset} HTTP ${res!.status}: ${text}`);
    // Even on transport timeout, broadcast ack — the work likely succeeded
    // on the receiver's side; we just lost the response channel.
    await broadcastA2A(ackText(`(transport ${res!.status})`), "ack");
    process.exit(2);
  }

  const text = await res!.text();
  let body: { response?: unknown; error?: string | null } & Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    console.error(`\n${dim}[mcp:call]${reset} non-JSON response: ${text}`);
    process.exit(2);
  }

  if (body.error) {
    console.error(`\n${dim}[mcp:call]${reset} router error: ${body.error}`);
    await broadcastA2A(ackText("(router error)"), "ack");
    process.exit(2);
  }

  // Router wraps as { response: <jsonrpc>, error: null }
  const inner = (body.response ?? body) as {
    error?: { message?: string };
    result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
  };

  if (inner.error) {
    console.error(`\n${dim}[mcp:call]${reset} tool error: ${inner.error.message ?? JSON.stringify(inner.error)}`);
    await broadcastA2A(ackText("(tool error)"), "ack");
    process.exit(2);
  }

  const content = inner.result?.content?.[0]?.text;
  if (content) {
    let parsed: unknown = content;
    try { parsed = JSON.parse(content); } catch { /* not JSON, that's fine */ }
    console.log(`\n${dim}[mcp:call] result:${reset}`, JSON.stringify(parsed, null, 2));
    const ack = ackText();
    console.log(`${dim}[chat]${reset} ${cyan}${ack}${reset}`);
    await broadcastA2A(ack, "ack");
    if (inner.result?.isError) process.exit(3);
  } else {
    console.log(`\n${dim}[mcp:call] full response:${reset}`, JSON.stringify(inner, null, 2));
    await broadcastA2A(ackText(), "ack");
  }
})();

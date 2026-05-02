// scripts/mcp-call.ts — sender side of an MCP call across AXL.
//
// Usage:
//   npm run mcp:call -- <target-role> <service> <tool> '<json-args>'
//
// Resolves <target-role> → pubkey via axl/peers.json, builds a JSON-RPC
// envelope, POSTs to local AXL :9002/mcp/<peer-pubkey>/<service>, and prints
// the response. AXL forwards over Yggdrasil to the receiver, which dispatches
// to its registered MCP server.

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
const reset = "\x1b[0m";

console.log(`${dim}[mcp:call]${reset} ${cyan}${myRole}${reset} → ${yellow}${targetRole}${reset}.${service}.${tool}(${JSON.stringify(toolArgs)})`);
console.log(`${dim}[mcp:call] POST ${url}${reset}`);

(async () => {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jsonRpc),
    });
  } catch (err) {
    console.error(`[mcp:call] network error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const text = await res.text();
  if (!res.ok) {
    console.error(`[mcp:call] HTTP ${res.status}: ${text}`);
    process.exit(2);
  }

  let body: { response?: unknown; error?: string | null } & Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    console.error(`[mcp:call] non-JSON response: ${text}`);
    process.exit(2);
  }

  if (body.error) {
    console.error(`[mcp:call] router error: ${body.error}`);
    process.exit(2);
  }

  // Router wraps as { response: <jsonrpc>, error: null }
  const inner = (body.response ?? body) as {
    error?: { message?: string };
    result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
  };

  if (inner.error) {
    console.error(`[mcp:call] tool error: ${inner.error.message ?? JSON.stringify(inner.error)}`);
    process.exit(2);
  }

  const content = inner.result?.content?.[0]?.text;
  if (content) {
    let parsed: unknown = content;
    try { parsed = JSON.parse(content); } catch { /* not JSON, that's fine */ }
    console.log(`${dim}[mcp:call] result:${reset}`, JSON.stringify(parsed, null, 2));
    if (inner.result?.isError) process.exit(3);
  } else {
    console.log(`${dim}[mcp:call] full response:${reset}`, JSON.stringify(inner, null, 2));
  }
})();

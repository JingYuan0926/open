// axl/mcp-servers/aws.ts
//
// Express MCP service exposing the local AWS + OpenClaw demo scripts to
// remote agents over AXL. Each tool spawns the corresponding
// `tsx scripts/demo-*.ts` after the user approves on their terminal.
//
// Inbound flow:
//   sender (agent-b/c)   →  POST :9002/mcp/<user-pubkey>/aws  on their AXL node
//      → AXL Yggdrasil   →  user's AXL on :9002
//      → user's mcp-router.py on :9003 (POST /route)
//      → THIS server on :9100 (POST /mcp)
//      → terminal approval prompt on user's machine
//      → child_process.spawn("tsx", ["scripts/demo-...ts"])
//      → response back through the same chain
//
// On startup we POST /register to the router so it knows where to forward
// calls for service "aws". We retry registration in case the router takes a
// moment to come up.

import express from "express";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { matchesPeer } from "../axl";
import { promptApproval } from "./permission";

const PORT = 9100;
const ROUTER_URL = "http://127.0.0.1:9003";
const SERVICE_NAME = "aws";
const MOCK = process.env.MCP_AWS_MODE === "mock";

// Resolved against cwd, which `axl-start.sh` sets to repo root before exec'ing
// us via tsx. Same convention as the rest of the AXL scripts.
const TSX_BIN = resolve("node_modules/.bin/tsx");
const STATE_PATH = join(tmpdir(), "openclaw-demo-state.json");

interface PeerEntry { apiPort: number; pubkey: string; }

function loadPeerPubkeys(): Record<string, string> {
  const raw = JSON.parse(
    readFileSync(resolve("axl/peers.json"), "utf8"),
  ) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [role, val] of Object.entries(raw)) {
    if (val && typeof val === "object" && "pubkey" in val) {
      const pk = (val as PeerEntry).pubkey;
      if (pk) out[role] = pk;
    }
  }
  return out;
}

function resolveRole(headerPeerId: string): string {
  if (!headerPeerId) return "?";
  const peers = loadPeerPubkeys();
  for (const [role, pubkey] of Object.entries(peers)) {
    if (matchesPeer(headerPeerId, pubkey)) return role;
  }
  return "?";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface ScriptResult {
  ok: boolean;
  exit_code: number | null;
  stdout_tail: string;
  stderr_tail: string;
}

// Mutable status object shared between runDemoScript and the progress pinger.
// runDemoScript updates `status` whenever a `━━ [N/M] …` step header or `→`
// progress arrow shows up in the script's stdout; the pinger reads it.
interface ScriptProgress {
  status: string;
  startedAt: number;
}

function newProgress(initial: string): ScriptProgress {
  return { status: initial, startedAt: Date.now() };
}

// Pull "step N/M: title" or arrow-prefixed status lines out of a stdout chunk.
// Returns the latest one found, or null if there isn't one.
function extractLatestProgress(chunk: string): string | null {
  const lines = chunk.split("\n");
  let latest: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    // ━━ [4/6] aws ec2 run-instances t3.micro
    const stepMatch = line.match(/━━\s*\[(\d+)\/(\d+)\]\s*(.+)/);
    if (stepMatch) {
      latest = `step ${stepMatch[1]}/${stepMatch[2]} — ${stepMatch[3].trim()}`;
      continue;
    }
    // → Opening AWS landing page…
    const arrowMatch = line.match(/^→\s*(.+)/);
    if (arrowMatch) {
      latest = arrowMatch[1].trim();
    }
  }
  return latest;
}

// Spawn a demo script. stdout/stderr both stream to *this* server's terminal
// (so the user can watch the demo progress live) AND get captured (last few
// KB) for the MCP JSON-RPC response. If `progress` is supplied, recognised
// status lines update it in real time.
function runDemoScript(
  scriptRelPath: string,
  env: Record<string, string> = {},
  progress?: ScriptProgress,
): Promise<ScriptResult> {
  return new Promise((res) => {
    if (!existsSync(TSX_BIN)) {
      res({
        ok: false,
        exit_code: null,
        stdout_tail: "",
        stderr_tail: `tsx not found at ${TSX_BIN}. Run 'npm install' first.`,
      });
      return;
    }
    if (!existsSync(resolve(scriptRelPath))) {
      res({
        ok: false,
        exit_code: null,
        stdout_tail: "",
        stderr_tail: `script not found: ${scriptRelPath}`,
      });
      return;
    }

    const child = spawn(TSX_BIN, [scriptRelPath], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const tailMax = 4000;
    const tail = (s: string) => (s.length > tailMax ? s.slice(-tailMax) : s);

    child.stdout.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      process.stdout.write(s);
      stdout += s;
      if (progress) {
        const next = extractLatestProgress(s);
        if (next) progress.status = next;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      process.stderr.write(s);
      stderr += s;
    });
    child.on("close", (code) => {
      res({
        ok: code === 0,
        exit_code: code,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
      });
    });
    child.on("error", (err) => {
      res({
        ok: false,
        exit_code: null,
        stdout_tail: tail(stdout),
        stderr_tail: tail(`${stderr}\nspawn error: ${err.message}`),
      });
    });
  });
}

function readState(): { publicIp?: string; instanceId?: string; region?: string } | null {
  if (!existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
//  Progress pings: while a long-running tool is in flight, fire an A2A
//  message to every other peer every PROGRESS_MS with the *current* step
//  parsed out of the script's stdout — e.g. "step 4/6 — aws ec2 run-
//  instances t3.micro · 38s elapsed". The receiving peer's agent.ts logs
//  it, so the audience watches real progress unfold across machines
//  instead of staring at a blank terminal until the whole call returns.
//  Pure UI plumbing — does not change the script's behaviour or success.
// ────────────────────────────────────────────────────────────────────────
const PROGRESS_MS = 20_000;

function loadMyRole(): string {
  try { return readFileSync(resolve(".axl/role"), "utf8").trim(); }
  catch { return "?"; }
}

interface RawPeerEntry { apiPort?: number; pubkey?: string; }

async function broadcastA2A(text: string): Promise<void> {
  const myRole = loadMyRole();
  let peers: Record<string, RawPeerEntry>;
  try {
    peers = JSON.parse(readFileSync(resolve("axl/peers.json"), "utf8")) as Record<string, RawPeerEntry>;
  } catch {
    return;
  }

  const myEntry = peers[myRole];
  const myPort = myEntry?.apiPort ?? 9002;

  const tasks: Promise<unknown>[] = [];
  for (const [role, entry] of Object.entries(peers)) {
    if (role === myRole) continue;
    if (!entry || typeof entry !== "object") continue;
    const pk = entry.pubkey;
    if (!pk) continue;

    const url = `http://127.0.0.1:${myPort}/a2a/${pk}`;
    const body = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: `progress-${Date.now()}-${role}`,
          role: "user",
          parts: [{ kind: "text", text }],
          metadata: { fromRole: myRole, progress: true },
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
          if (!r.ok) console.log(`[progress] ✗ ping to ${role} returned HTTP ${r.status}`);
        })
        .catch((err) => {
          clearTimeout(t);
          console.log(`[progress] ✗ ping to ${role} failed: ${err instanceof Error ? err.message : String(err)}`);
        }),
    );
  }
  await Promise.all(tasks);
}

async function withProgress<T>(
  label: string,
  fn: (progress: ScriptProgress) => Promise<T>,
): Promise<T> {
  const progress = newProgress(`${label} starting`);
  console.log(`[progress] tracking ${label} every ${PROGRESS_MS / 1000}s`);
  const tickId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - progress.startedAt) / 1000);
    const text = `${label} · ${progress.status} · ${elapsed}s elapsed`;
    broadcastA2A(text).catch((e) =>
      console.log(`[progress] ping failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  }, PROGRESS_MS);
  try {
    return await fn(progress);
  } finally {
    clearInterval(tickId);
    const total = Math.floor((Date.now() - progress.startedAt) / 1000);
    console.log(`[progress] ${label} ended after ${total}s — last status: ${progress.status}`);
    broadcastA2A(`${label} done · ${progress.status} · ${total}s total`).catch(() => undefined);
  }
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const tools: Record<string, ToolHandler> = {
  // Step 1 — open AWS sign-in pages in the user's default Chrome.
  // Wraps `npm run demo:aws-1`. The user signs in at their own pace.
  aws_signin: async () => {
    if (MOCK) {
      console.log(`[aws-mcp] (mock) would run scripts/demo-aws-1.ts`);
      await sleep(1500);
      return { ok: true, mocked: true };
    }
    return await runDemoScript("scripts/demo-aws-1.ts");
  },

  // Step 2 — provision EC2 (keypair, SG, run-instances, wait running + sshd).
  // Wraps `npm run demo:aws-2`. On success, demo:aws-2 writes a state file at
  // $TMPDIR/openclaw-demo-state.json which we surface in the response.
  provision_ec2: async () => {
    if (MOCK) {
      await sleep(2500);
      return {
        ok: true,
        mocked: true,
        state: {
          instanceId: "i-mockedfake1234567",
          publicIp: "203.0.113.10",
          region: "us-east-1",
        },
      };
    }
    return await withProgress("provision_ec2", async (progress) => {
      const r = await runDemoScript("scripts/demo-aws-2.ts", {}, progress);
      return { ...r, state: r.ok ? readState() : null };
    });
  },

  // Step 3 — install OpenClaw on the provisioned EC2 box. Wraps
  // `npm run demo:openclaw`. Outer mode spawns Terminal.app for the SSH
  // session and exits quickly; the install continues in the new window. If
  // an explicit public_ip is passed it overrides the state-file lookup.
  install_openclaw: async (args) => {
    const passedIp =
      typeof args?.public_ip === "string" ? (args.public_ip as string) : undefined;
    const env: Record<string, string> = {};
    if (passedIp) env.PUBLIC_IP = passedIp;
    const targetIp = passedIp ?? readState()?.publicIp ?? null;

    if (MOCK) {
      await sleep(2000);
      return { ok: true, mocked: true, target: targetIp };
    }
    return await withProgress("install_openclaw", async (progress) => {
      const r = await runDemoScript("scripts/demo-openclaw.ts", env, progress);
      return { ...r, target: targetIp };
    });
  },
};

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/mcp", async (req, res) => {
  const headerPeerId = (req.headers["x-from-peer-id"] as string) ?? "";
  const fromRole = resolveRole(headerPeerId);

  const body = req.body ?? {};
  const id = body.id ?? null;
  const method = body.method;
  const toolName: string | undefined = body.params?.name ?? body.tool;
  const args: Record<string, unknown> = body.params?.arguments ?? body.args ?? {};

  if (method && method !== "tools/call") {
    return res.status(200).json({
      jsonrpc: "2.0", id,
      error: { code: -32601, message: `Method not supported: ${method}` },
    });
  }

  if (!toolName || !(toolName in tools)) {
    return res.status(200).json({
      jsonrpc: "2.0", id,
      error: { code: -32601, message: `Tool not found: ${toolName ?? "(none)"}` },
    });
  }

  const approved = await promptApproval({
    fromRole, service: SERVICE_NAME, tool: toolName, args,
  });

  if (!approved) {
    return res.status(200).json({
      jsonrpc: "2.0", id,
      result: {
        content: [{ type: "text", text: JSON.stringify({ error: "user denied" }) }],
        isError: true,
      },
    });
  }

  try {
    console.log(`[aws-mcp] running ${toolName}…`);
    const result = await tools[toolName](args);
    console.log(`[aws-mcp] ${toolName} returned`);
    return res.status(200).json({
      jsonrpc: "2.0", id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result) }],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[aws-mcp] ${toolName} ERROR: ${msg}`);
    return res.status(200).json({
      jsonrpc: "2.0", id,
      result: {
        content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
        isError: true,
      },
    });
  }
});

async function registerWithRouter(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const r = await fetch(`${ROUTER_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: SERVICE_NAME,
          endpoint: `http://127.0.0.1:${PORT}/mcp`,
        }),
      });
      if (r.ok) {
        console.log(`[aws-mcp] registered with router as service '${SERVICE_NAME}'`);
        return;
      }
    } catch {
      // router not up yet; retry
    }
    await sleep(1000);
  }
  console.warn(`[aws-mcp] could not register with router after 30s — service may not receive calls`);
}

app.listen(PORT, () => {
  console.log(`[aws-mcp] listening on http://127.0.0.1:${PORT}/mcp${MOCK ? "  (MOCK MODE)" : ""}`);
  console.log(`[aws-mcp] tools: ${Object.keys(tools).join(", ")}`);
  registerWithRouter();
});

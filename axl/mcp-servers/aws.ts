// axl/mcp-servers/aws.ts
//
// Express MCP service exposing AWS operations to remote agents over AXL.
//
// Inbound flow:
//   sender (agent-b/c)  →  POST :9002/mcp/<user-pubkey>/aws  on their AXL node
//      → AXL Yggdrasil  →  user's AXL on :9002
//      → user's mcp-router.py on :9003 (POST /route)
//      → THIS server on :9100 (POST /mcp)
//      → permission prompt on user's terminal
//      → tool dispatch (browser / EC2 SDK / SSH)
//      → response back through the same chain
//
// On startup we POST /register to the router so it knows where to forward calls
// for service "aws". The router retries on its side; we also retry registration
// in case the router takes a moment to come up.

import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchesPeer } from "../axl";
import { promptApproval } from "./permission";
import { openUrl } from "./aws-helpers/browser";
import { AWS_URLS } from "./aws-helpers/urls";
import { runInstance, waitForRunning } from "./aws-helpers/ec2";
import { runRemote } from "./aws-helpers/ssh";

const PORT = 9100;
const ROUTER_URL = "http://127.0.0.1:9003";
const SERVICE_NAME = "aws";
const MOCK = process.env.MCP_AWS_MODE === "mock";

const KEY_PATH = resolve("axl/nanoclaw-key.pem");

// nanoclaw "install" command. Default placeholder = always succeeds in <1s.
// Replace with the real install one-liner when you have it.
const NANOCLAW_INSTALL_CMD = process.env.NANOCLAW_INSTALL_CMD ??
  `echo "nanoclaw installed: $(date)" > /tmp/nanoclaw.log && cat /tmp/nanoclaw.log`;

interface PeerEntry { apiPort: number; pubkey: string; }

function loadPeerPubkeys(): Record<string, string> {
  const raw = JSON.parse(readFileSync(resolve("axl/peers.json"), "utf8")) as Record<string, unknown>;
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
  return new Promise(r => setTimeout(r, ms));
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const tools: Record<string, ToolHandler> = {
  open_console: async () => {
    const url = AWS_URLS.launchWizard;
    if (MOCK) {
      console.log(`[aws-mcp] (mock) would open ${url}`);
      return { ok: true, opened: url, mocked: true };
    }
    await openUrl(url);
    return { ok: true, opened: url };
  },

  launch_instance: async (args) => {
    const name = (args?.name as string) ?? "nanoclaw-demo";
    if (MOCK) {
      await sleep(2000);
      return { instance_id: "i-mockedfake1234567", public_ip: "203.0.113.10", mocked: true };
    }
    return await runInstance(name);
  },

  wait_for_running: async (args) => {
    const id = args?.instance_id as string;
    if (!id) throw new Error("missing instance_id");
    if (MOCK) {
      await sleep(1000);
      return { state: "running", public_ip: "203.0.113.10", mocked: true };
    }
    const ip = await waitForRunning(id);
    return { state: "running", public_ip: ip };
  },

  show_in_console: async (args) => {
    const id = args?.instance_id as string;
    if (!id) throw new Error("missing instance_id");
    const url = AWS_URLS.instanceDetail(id);
    if (MOCK) {
      console.log(`[aws-mcp] (mock) would open ${url}`);
      return { ok: true, opened: url, mocked: true };
    }
    await openUrl(url);
    return { ok: true, opened: url };
  },

  install_nanoclaw: async (args) => {
    const id = args?.instance_id as string;
    const ip = args?.public_ip as string;
    if (!id || !ip) throw new Error("missing instance_id or public_ip");
    if (MOCK) {
      await sleep(2000);
      return {
        ok: true,
        stdout: `nanoclaw installed on ${ip} (mocked)`,
        stderr: "",
        exit_code: 0,
        mocked: true,
      };
    }
    if (!existsSync(KEY_PATH)) {
      throw new Error(`SSH key not found at ${KEY_PATH}. Save your EC2 keypair .pem there.`);
    }
    const result = await runRemote({
      host: ip,
      keyPath: KEY_PATH,
      command: NANOCLAW_INSTALL_CMD,
    });
    return {
      ok: result.code === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.code,
    };
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
    console.log(`[aws-mcp] ${toolName} ok: ${JSON.stringify(result)}`);
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

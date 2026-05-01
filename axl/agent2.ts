import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { A2ATaskRequest, A2ATaskResponse } from "./a2a.js";

const NODE2_PORT = parseInt(process.env.NODE2_API_PORT ?? "9003");

async function getNode1Pubkey(): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${NODE2_PORT}/topology`);
    if (!res.ok) return null;
    const data = await res.json();
    const connectedPeer = data.peers?.find((p: { up: boolean; public_key: string }) => p.up && p.public_key);
    return connectedPeer?.public_key ?? null;
  } catch {
    return null;
  }
}

async function sendA2AResponse(node1Pubkey: string, response: A2ATaskResponse): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${NODE2_PORT}/send`, {
      method: "POST",
      headers: { "X-Destination-Peer-Id": node1Pubkey },
      body: JSON.stringify(response),
    });
    console.log(`[A2A-ACK] Sent task response id=${response.id} back to Node 1`);
  } catch (e) {
    console.error("[A2A-ACK] Failed to send response:", e);
  }
}

async function callMcpSendEmail(to: string, subject: string, body: string): Promise<void> {
  console.log(`[MCP-CLIENT] Connecting to MCP email tool server...`);

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "axl/mcp-server.ts"],
    env: { ...process.env } as Record<string, string>,
  });

  const client = new Client({ name: "agent2-mcp-client", version: "1.0.0" });
  await client.connect(transport);

  console.log(`[MCP-CLIENT] Calling tool: send_email → ${to}`);
  const result = await client.callTool({
    name: "send_email",
    arguments: { to, subject, body },
  });

  await client.close();

  const text = (result.content as Array<{ type: string; text: string }>)
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join(" ");
  console.log(`[MCP-CLIENT] Tool result: ${text}`);
}

async function poll(): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${NODE2_PORT}/recv`);
    if (!res.ok) return;
    const text = await res.text();
    if (!text || !text.trim()) return;

    const fromPeerId = res.headers.get("X-From-Peer-Id") ?? "unknown";
    console.log(`[AXL-RECV] A2A message from peer: ${fromPeerId}`);

    let task: A2ATaskRequest;
    try {
      task = JSON.parse(text);
    } catch {
      console.warn("[AGENT2] Received non-JSON message, ignoring:", text);
      return;
    }

    if (task.jsonrpc !== "2.0" || task.method !== "tasks/send") {
      console.log(`[AGENT2] Unknown message format, ignoring`);
      return;
    }

    const { id: taskId, message } = task.params;
    const { to, subject, body } = message.parts[0].data;

    console.log(`[A2A] Task received — id=${taskId}, to=${to}`);

    const node1Pubkey = fromPeerId !== "unknown" ? fromPeerId : await getNode1Pubkey();

    // Send "working" status back
    if (node1Pubkey) {
      await sendA2AResponse(node1Pubkey, {
        jsonrpc: "2.0",
        id: task.id,
        result: { id: taskId, status: { state: "working", message: "Calling MCP email tool..." } },
      });
    }

    try {
      // Call MCP server to send the email
      await callMcpSendEmail(to, subject, body);

      if (node1Pubkey) {
        await sendA2AResponse(node1Pubkey, {
          jsonrpc: "2.0",
          id: task.id,
          result: {
            id: taskId,
            status: { state: "completed" },
            artifacts: [{ parts: [{ type: "text", text: `Email delivered to ${to}` }] }],
          },
        });
      }
    } catch (e) {
      console.error("[AGENT2] Email sending failed:", e);
      if (node1Pubkey) {
        await sendA2AResponse(node1Pubkey, {
          jsonrpc: "2.0",
          id: task.id,
          result: { id: taskId, status: { state: "failed", message: String(e) } },
        });
      }
    }
  } catch (e) {
    console.error("[POLL-ERROR]", e);
  }
}

console.log(`[AGENT2] Node 2 A2A agent started — polling localhost:${NODE2_PORT}/recv every 2s`);
console.log(`[AGENT2] Will call MCP email tool server for each task`);

setInterval(poll, 2000);

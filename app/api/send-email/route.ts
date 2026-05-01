import { NextRequest, NextResponse } from "next/server";
import { getTopology, axlSend } from "@/lib/axl";
import type { A2ATaskRequest } from "@/lib/a2a";

const NODE1_PORT = parseInt(process.env.NODE1_API_PORT ?? "9002");

export async function POST(req: NextRequest) {
  const { to, subject, body } = await req.json();

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "Missing to, subject, or body" }, { status: 400 });
  }

  // Get topology from Node 1 to find Node 2's pubkey dynamically
  let topology;
  try {
    topology = await getTopology(NODE1_PORT);
  } catch {
    return NextResponse.json({ error: "Cannot reach AXL Node 1. Is it running?" }, { status: 503 });
  }

  const node1Pubkey = topology.our_public_key;
  const connectedPeer = topology.peers.find((p) => p.up && p.public_key);

  if (!connectedPeer) {
    return NextResponse.json({ error: "Node 2 is not connected. Start both AXL nodes first." }, { status: 503 });
  }

  const node2Pubkey = connectedPeer.public_key;
  const taskId = crypto.randomUUID();
  const rpcId = crypto.randomUUID();

  // Wrap in A2A task format (Google's Agent-to-Agent protocol)
  const task: A2ATaskRequest = {
    jsonrpc: "2.0",
    method: "tasks/send",
    id: rpcId,
    params: {
      id: taskId,
      message: {
        role: "user",
        parts: [{ type: "data", data: { to, subject, body } }],
      },
      metadata: {
        fromAgent: node1Pubkey,
        timestamp: new Date().toISOString(),
      },
    },
  };

  try {
    await axlSend(NODE1_PORT, node2Pubkey, task);
  } catch (e) {
    return NextResponse.json({ error: `AXL send failed: ${e}` }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    taskId,
    rpcId,
    log: [
      `[AXL] Fetched topology from Node 1 (${node1Pubkey.slice(0, 12)}...)`,
      `[AXL] Found connected peer: Node 2 (${node2Pubkey.slice(0, 12)}...)`,
      `[A2A] Wrapped request as A2A task id=${taskId}`,
      `[AXL] Sent A2A task via encrypted P2P mesh to Node 2`,
      `[A2A] Waiting for task status update from Node 2...`,
    ],
  });
}

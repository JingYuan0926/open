import type { NextApiRequest, NextApiResponse } from "next";
import { getTopology, axlSend } from "@/axl/axl";
import type { A2ATaskRequest } from "@/axl/a2a";

const NODE1_PORT = parseInt(process.env.NODE1_API_PORT ?? "9002");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing to, subject, or body" });
  }

  let topology;
  try {
    topology = await getTopology(NODE1_PORT);
  } catch {
    return res.status(503).json({ error: "Cannot reach AXL Node 1. Is it running?" });
  }

  const node1Pubkey = topology.our_public_key;
  const connectedPeer = topology.peers.find((p: { up: boolean; public_key: string }) => p.up && p.public_key);

  if (!connectedPeer) {
    return res.status(503).json({ error: "Node 2 is not connected. Start both AXL nodes first." });
  }

  const node2Pubkey = connectedPeer.public_key;
  const taskId = crypto.randomUUID();
  const rpcId = crypto.randomUUID();

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
    return res.status(500).json({ error: `AXL send failed: ${e}` });
  }

  return res.json({
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

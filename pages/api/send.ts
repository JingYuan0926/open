import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { AgentCard } from "@a2a-js/sdk";
import { getTopology } from "@/axl/axl";

const NODE1_PORT = parseInt(process.env.NODE1_API_PORT ?? "9002");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, peerId } = req.body as { text?: string; peerId?: string };
  if (!text) {
    return res.status(400).json({ error: "Missing text" });
  }

  let destPeer = peerId;
  if (!destPeer) {
    let topology;
    try {
      topology = await getTopology(NODE1_PORT);
    } catch {
      return res.status(503).json({ error: "Cannot reach AXL Node 1. Is it running?" });
    }
    const connected = topology.peers.find((p) => p.up && p.public_key);
    if (!connected) {
      return res.status(503).json({ error: "No connected peer. Start Node 2 and wait for the mesh to come up." });
    }
    destPeer = connected.public_key;
  }

  const axlUrl = `http://127.0.0.1:${NODE1_PORT}/a2a/${destPeer}`;

  // 1. Discovery: AXL exposes GET /a2a/{peer_id} which forwards to the remote
  //    peer's /.well-known/agent-card.json over the mesh.
  const cardRes = await fetch(axlUrl);
  if (!cardRes.ok) {
    return res.status(502).json({
      error: `Agent card fetch failed: ${cardRes.status}`,
      raw: await cardRes.text(),
    });
  }
  const remoteCard = (await cardRes.json()) as AgentCard;

  // 2. Override the card's url so the SDK client POSTs through AXL's forward
  //    endpoint instead of the receiver's unreachable localhost A2A port.
  const routedCard: AgentCard = { ...remoteCard, url: axlUrl };

  // 3. Build the A2A SDK client and send via spec method message/send.
  const client = await new ClientFactory().createFromAgentCard(routedCard);
  const result = await client.sendMessage({
    message: {
      kind: "message",
      messageId: randomUUID(),
      role: "user",
      parts: [{ kind: "text", text }],
    },
  });

  return res.json({
    peerId: destPeer,
    agentCard: remoteCard,
    result,
  });
}

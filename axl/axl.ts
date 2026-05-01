export interface EmailRequest {
  type: "EMAIL_REQUEST";
  id: string;
  timestamp: string;
  fromPeer: string;
  payload: {
    to: string;
    subject: string;
    body: string;
  };
}

export interface EmailAck {
  type: "EMAIL_ACK";
  id: string;
  status: "delivered" | "failed";
  error?: string;
}

export interface AXLTopology {
  our_ipv6: string;
  our_public_key: string;
  peers: {
    uri: string;
    up: boolean;
    inbound: boolean;
    public_key: string;
    port: number;
  }[];
}

export async function getTopology(port: number): Promise<AXLTopology> {
  const res = await fetch(`http://127.0.0.1:${port}/topology`);
  if (!res.ok) throw new Error(`Topology fetch failed: ${res.status}`);
  return res.json();
}

export async function axlSend(
  port: number,
  destPubkey: string,
  message: object
): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${port}/send`, {
    method: "POST",
    headers: { "X-Destination-Peer-Id": destPubkey },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AXL send failed: ${res.status} — ${text}`);
  }
}

export async function axlRecv(
  port: number
): Promise<{ body: string; fromPeerId: string } | null> {
  const res = await fetch(`http://127.0.0.1:${port}/recv`);
  if (!res.ok) return null;
  const body = await res.text();
  if (!body || !body.trim()) return null;
  const fromPeerId = res.headers.get("X-From-Peer-Id") ?? "";
  return { body, fromPeerId };
}

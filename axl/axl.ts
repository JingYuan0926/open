export interface AXLPeer {
  uri: string;
  up: boolean;
  inbound: boolean;
  public_key: string;
  port: number;
}

export interface AXLTopology {
  our_ipv6: string;
  our_public_key: string;
  peers: AXLPeer[];
}

export async function getTopology(port: number): Promise<AXLTopology> {
  const res = await fetch(`http://127.0.0.1:${port}/topology`);
  if (!res.ok) throw new Error(`Topology fetch failed: ${res.status}`);
  return res.json();
}

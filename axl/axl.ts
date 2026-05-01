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

// AXL truncates X-From-Peer-Id to ~28 hex chars + 'f' padding instead of the full 64-hex pubkey.
// Use this to resolve a received header back to a known full pubkey.
export function matchesPeer(reportedHeader: string, fullPubkey: string): boolean {
  const stripped = reportedHeader.replace(/f+$/i, "");
  if (!stripped) return false;
  return fullPubkey.toLowerCase().startsWith(stripped.toLowerCase());
}

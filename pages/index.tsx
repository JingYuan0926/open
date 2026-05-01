import { useCallback, useEffect, useState } from "react";

interface Peer {
  up: boolean;
  public_key: string;
  uri: string;
}

interface NodeInfo {
  our_public_key: string;
  our_ipv6: string;
  peers: Peer[];
}

interface TopologyData {
  node1: NodeInfo | null;
  node2: NodeInfo | null;
}

export default function Home() {
  const [text, setText] = useState("");
  const [peerId, setPeerId] = useState("");
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [output, setOutput] = useState<string>("");

  const fetchTopology = useCallback(async () => {
    try {
      const res = await fetch("/api/topology");
      setTopology(await res.json());
    } catch {
      setTopology(null);
    }
  }, []);

  useEffect(() => {
    fetchTopology();
    const t = setInterval(fetchTopology, 5000);
    return () => clearInterval(t);
  }, [fetchTopology]);

  async function handleSend(e: React.SyntheticEvent) {
    e.preventDefault();
    setStatus("sending");
    setOutput("");

    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, peerId: peerId || undefined }),
    });

    const data = await res.json();
    setOutput(JSON.stringify(data, null, 2));
    setStatus(res.ok ? "ok" : "error");
  }

  const node1Up = !!topology?.node1;
  const node2Up = !!topology?.node2;
  const peers = topology?.node1?.peers?.filter((p) => p.up) ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="border border-zinc-700 rounded-lg p-4">
          <h1 className="text-xl font-bold">AXL · A2A demo</h1>
          <p className="text-zinc-400 text-sm mt-1">
            POST <code>/a2a/&#123;peer_id&#125;</code> on Node 1 → AXL mesh → Node 2&apos;s A2A SDK server (echo skill).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-zinc-700 rounded-lg p-4 space-y-2">
            <h2 className="text-xs uppercase text-zinc-400">Network</h2>
            <div className="text-xs">
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${node1Up ? "bg-green-400" : "bg-red-500"}`} />
              Node 1 (sender){topology?.node1 && <span className="text-zinc-500"> — {topology.node1.our_public_key.slice(0, 14)}…</span>}
            </div>
            <div className="text-xs">
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${node2Up ? "bg-green-400" : "bg-red-500"}`} />
              Node 2 (agent){topology?.node2 && <span className="text-zinc-500"> — {topology.node2.our_public_key.slice(0, 14)}…</span>}
            </div>
            <div className="pt-2 text-xs text-zinc-500">Connected peers: {peers.length}</div>
            {peers.map((p) => (
              <div key={p.public_key} className="text-xs text-zinc-500 break-all">
                {p.public_key.slice(0, 24)}…
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="md:col-span-2 border border-zinc-700 rounded-lg p-4 space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Peer ID (leave blank to use first connected peer)</label>
              <input
                value={peerId}
                onChange={(e) => setPeerId(e.target.value)}
                placeholder="hex-encoded ed25519 public key"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Message</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                required
                placeholder="Hello, agent."
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={status === "sending" || peers.length === 0}
              className="bg-white text-black text-sm font-semibold rounded px-4 py-2 disabled:opacity-40"
            >
              {status === "sending" ? "Sending…" : "Send via /a2a"}
            </button>
            {peers.length === 0 && <p className="text-xs text-yellow-500">Start both AXL nodes and the A2A agent.</p>}
          </form>
        </div>

        {output && (
          <pre className="border border-zinc-700 rounded-lg p-4 text-xs whitespace-pre-wrap break-all bg-zinc-900">
{output}
          </pre>
        )}
      </div>
    </div>
  );
}

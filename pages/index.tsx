import { useState, useEffect, useCallback } from "react";

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
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "working" | "delivered" | "failed">("idle");
  const [topology, setTopology] = useState<TopologyData | null>(null);

  const fetchTopology = useCallback(async () => {
    try {
      const res = await fetch("/api/topology");
      const data = await res.json();
      setTopology(data);
    } catch {
      setTopology(null);
    }
  }, []);

  useEffect(() => {
    fetchTopology();
    const interval = setInterval(fetchTopology, 5000);
    return () => clearInterval(interval);
  }, [fetchTopology]);

  const addLog = (msg: string) => setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);

  async function handleSend(e: React.SyntheticEvent) {
    e.preventDefault();
    setStatus("sending");
    setLog([]);

    addLog("Sending A2A task request to Node 1...");

    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body }),
    });

    const data = await res.json();

    if (!res.ok) {
      addLog(`Error: ${data.error}`);
      setStatus("failed");
      return;
    }

    data.log?.forEach((line: string) => addLog(line));

    addLog("Polling Node 1 for A2A task status from Node 2...");
    let attempts = 0;
    const maxAttempts = 20;

    const poll = setInterval(async () => {
      attempts++;
      const ackRes = await fetch("/api/poll-status");
      const ack = await ackRes.json();

      if (ack.status === "working") {
        addLog(`[MCP] Node 2 agent is working: ${ack.detail}`);
        setStatus("working");
      } else if (ack.status === "delivered") {
        addLog(`[A2A] Task completed by Node 2 (${ack.fromPeer?.slice(0, 12)}...)`);
        addLog(`[MCP] Tool result: ${ack.detail}`);
        setStatus("delivered");
        clearInterval(poll);
      } else if (ack.status === "failed") {
        addLog(`[A2A] Task failed: ${ack.error}`);
        setStatus("failed");
        clearInterval(poll);
      } else if (attempts >= maxAttempts) {
        addLog("No A2A response within timeout. Email may still have been delivered.");
        setStatus("delivered");
        clearInterval(poll);
      }
    }, 2000);
  }

  const node1Up = !!topology?.node1;
  const node2Up = !!topology?.node2;
  const connectedPeers = topology?.node1?.peers?.filter((p) => p.up) ?? [];
  const connected = connectedPeers.length > 0;
  const internetPeers = connectedPeers.filter((p) => p.uri && !p.uri.includes("127.0.0.1"));
  const isInternetPeer = internetPeers.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-700 rounded-lg p-4">
          <h1 className="text-xl font-bold text-white">AXL Email Bridge</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Send emails via Gensyn&apos;s AXL encrypted P2P mesh using A2A protocol + MCP tool calling.
          </p>
          {/* Protocol badges */}
          <div className="flex gap-2 mt-3">
            <span className="text-xs px-2 py-0.5 rounded border border-blue-700 text-blue-400">AXL P2P</span>
            <span className="text-xs px-2 py-0.5 rounded border border-purple-700 text-purple-400">A2A Protocol</span>
            <span className="text-xs px-2 py-0.5 rounded border border-emerald-700 text-emerald-400">MCP Tool Calling</span>
          </div>
        </div>

        {/* Protocol Flow Diagram */}
        <div className="border border-zinc-700 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Message Flow</h2>
          <div className="flex items-center gap-1 flex-wrap text-xs">
            <span className="px-2 py-1 bg-zinc-800 rounded text-zinc-300">Browser</span>
            <span className="text-zinc-600">→</span>
            <span className="px-2 py-1 bg-zinc-800 rounded text-zinc-300">Node 1</span>
            <span className="text-zinc-600">─</span>
            <span className="px-2 py-1 bg-blue-950 border border-blue-800 rounded text-blue-300">AXL Mesh</span>
            <span className="text-zinc-600">→</span>
            <span className="px-2 py-1 bg-zinc-800 rounded text-zinc-300">Node 2</span>
            <span className="text-zinc-600">→</span>
            <span className="px-2 py-1 bg-purple-950 border border-purple-800 rounded text-purple-300">A2A Task</span>
            <span className="text-zinc-600">→</span>
            <span className="px-2 py-1 bg-emerald-950 border border-emerald-800 rounded text-emerald-300">MCP send_email</span>
            <span className="text-zinc-600">→</span>
            <span className="px-2 py-1 bg-zinc-800 rounded text-zinc-300">Gmail</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Topology Sidebar */}
          <div className="border border-zinc-700 rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Network Status</h2>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${node1Up ? "bg-green-400" : "bg-red-500"}`} />
                <span className="text-xs text-zinc-300">Node 1</span>
                <span className="text-xs text-zinc-600 ml-auto">A2A sender</span>
              </div>
              {topology?.node1 && (
                <div className="text-xs text-zinc-500 pl-4 break-all">
                  {topology.node1.our_public_key.slice(0, 16)}...
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${node2Up ? "bg-green-400" : "bg-red-500"}`} />
                <span className="text-xs text-zinc-300">Node 2</span>
                <span className="text-xs text-zinc-600 ml-auto">A2A agent</span>
              </div>
              {topology?.node2 && (
                <div className="text-xs text-zinc-500 pl-4 break-all">
                  {topology.node2.our_public_key.slice(0, 16)}...
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-yellow-500"}`} />
                <span className="text-xs text-zinc-300">{connected ? "AXL mesh connected" : "Nodes not peered"}</span>
              </div>

              {/* Internet peer detection */}
              {connected && (
                <div className={`rounded px-2 py-1.5 text-xs border ${isInternetPeer ? "border-green-700 bg-green-950 text-green-300" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}>
                  {isInternetPeer ? (
                    <>
                      <div className="font-semibold mb-1">Internet Peer Connected</div>
                      {internetPeers.map((p) => (
                        <div key={p.public_key} className="text-green-500 break-all">
                          {p.uri} <br/>
                          <span className="text-green-700">{p.public_key.slice(0, 16)}...</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <span>Local peer only (127.0.0.1)</span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-xs text-zinc-500">A2A JSON-RPC 2.0</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-zinc-500">MCP stdio transport</span>
              </div>
            </div>

            <button
              onClick={fetchTopology}
              className="w-full text-xs text-zinc-400 border border-zinc-700 rounded px-2 py-1 hover:bg-zinc-800 transition-colors"
            >
              Refresh
            </button>
          </div>

          {/* Compose Form */}
          <div className="md:col-span-2 space-y-4">
            <div className="border border-zinc-700 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Compose Email</h2>
              <form onSubmit={handleSend} className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">To</label>
                  <input
                    type="email"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    required
                    placeholder="recipient@example.com"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    placeholder="Hello from AXL"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Body</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required
                    rows={4}
                    placeholder="Your message..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={status === "sending" || status === "working" || !connected}
                  className="w-full bg-white text-black font-semibold text-sm rounded px-4 py-2 hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {status === "sending" || status === "working"
                    ? "Sending via AXL + A2A + MCP..."
                    : "Send via AXL Network"}
                </button>
                {!connected && (
                  <p className="text-xs text-yellow-500">Start both AXL nodes before sending.</p>
                )}
              </form>
            </div>

            {/* Live Log */}
            {log.length > 0 && (
              <div className="border border-zinc-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Activity Log</h2>
                  {status === "delivered" && (
                    <span className="text-xs text-green-400 font-semibold">Delivered</span>
                  )}
                  {status === "failed" && (
                    <span className="text-xs text-red-400 font-semibold">Failed</span>
                  )}
                  {(status === "sending" || status === "working") && (
                    <span className="text-xs text-yellow-400 font-semibold animate-pulse">In progress...</span>
                  )}
                </div>
                <div className="space-y-1">
                  {log.map((line, i) => {
                    const isA2A = line.includes("[A2A]");
                    const isMcp = line.includes("[MCP]");
                    const isAxl = line.includes("[AXL]");
                    return (
                      <div key={i} className="text-xs font-mono flex gap-2">
                        <span className="text-zinc-600 shrink-0">&gt;</span>
                        {isA2A && <span className="text-purple-400 shrink-0">[A2A]</span>}
                        {isMcp && <span className="text-emerald-400 shrink-0">[MCP]</span>}
                        {isAxl && <span className="text-blue-400 shrink-0">[AXL]</span>}
                        <span className={isA2A ? "text-purple-300" : isMcp ? "text-emerald-300" : isAxl ? "text-blue-300" : "text-zinc-400"}>
                          {line.replace(/\[(A2A|MCP|AXL)\]\s*/g, "")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

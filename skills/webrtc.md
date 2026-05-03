---
name: webrtc
description: Stream the controlled machine's screen as live video and send mouse/keyboard events back, peer-to-peer. Production transport for "AI on laptop B controls laptop A."
priority: primary-for-remote
when_to_use: Two laptops, one wants to drive the other's screen with low latency (sub-second). You already have a P2P channel for signaling (AXL works).
when_to_skip: You only need a still screenshot stream — `screen.capture` + base64 over MCP is simpler. The controller is browser-only and you don't want to ship a native client → use `apache-guacamole`. Both peers are on the same LAN with no NAT — `vnc` is simpler and enough.
---

# webrtc

WebRTC handles three things you'd otherwise build by hand: NAT traversal (ICE + STUN/TURN), encrypted transport (DTLS + SRTP), and codec negotiation (VP8/H.264/AV1 for video, Opus for audio). For the OpenClaw remote-control case you get **video stream of the screen + a datachannel for input events**, both over a single P2P connection.

## Production stack

Three viable paths. Pick **A** for the cleanest fit with this project; **B** if you want managed infrastructure; **C** only if you must avoid native binaries.

### A. Pion sidecar (recommended for OpenClaw)

[Pion](https://github.com/pion/webrtc) is a pure-Go WebRTC implementation. Compile it once into a sidecar binary the Node MCP server spawns and talks to over JSON-RPC on stdio. Pion handles encoding (V4L2/CGDisplayStream input → VP8 via libvpx), ICE, DTLS, datachannel — all natively, ~15 MB binary.

```
axl/native/openclaw-rtc      ← Pion-based binary (Go)
axl/mcp-servers/screen-rtc.ts ← Node MCP wrapper that spawns it
```

Wire shape (Node ↔ binary, line-delimited JSON over stdio):

```
→ {"op":"create-offer","video":{"source":"screen","fps":15}}
← {"op":"offer-sdp","sdp":"v=0\r\no=- ...\r\n"}
→ {"op":"set-answer","sdp":"v=0\r\no=- ..."}
← {"op":"ice-candidate","candidate":"candidate:842163049 ..."}
→ {"op":"datachannel-recv","label":"input","data":"{...}"}
→ {"op":"close"}
```

Signaling (SDP offer/answer + ICE candidates) is shipped through your **existing AXL A2A channel**: each peer POSTs to `http://127.0.0.1:9002/a2a/<peer-pubkey>` with the SDP/ICE blob in the message body. AXL guarantees encrypted, peer-authenticated delivery — that's exactly what WebRTC signaling needs.

### B. LiveKit (managed; less code, monthly cost)

[LiveKit](https://livekit.io) is a hosted WebRTC SFU with first-class Node SDK. Used in production by Anthropic, OpenAI, Replit. Trade native binary for a $50/mo+ hosted facility.

```bash
npm install livekit-server-sdk @livekit/rtc-node
```

Each peer joins a "room" identified by the OpenClaw task ID. The controlled machine publishes a `screen_share` track; the controlling agent subscribes and sends inputs over a datachannel.

### C. Browser-as-sender (no native binary)

The controlled machine's OpenClaw connector spawns a **headless** Chrome window via Playwright that:

1. Calls `navigator.mediaDevices.getDisplayMedia({ video: true })` (the user gets a one-time screen-pick prompt).
2. Creates an `RTCPeerConnection`.
3. Sends offer/answer/ICE through a localhost websocket the connector exposes.
4. Receives input events over a datachannel and forwards them to a local injection daemon (`nut-js`) over IPC.

Works without compiling Go. Heavier (Chromium + 200MB), and the user has to grant screen-share once per session (Chrome does not persist the grant).

## Required setup (path A)

```bash
# Build the Pion sidecar (once per machine)
cd axl/native
go build -o openclaw-rtc ./cmd/rtc
chmod +x openclaw-rtc

# Node side
npm install simple-peer @nut-tree-fork/nut-js
```

macOS permissions on the controlled machine:
- **Screen Recording** → so Pion can read the framebuffer
- **Accessibility** → so the input executor can inject mouse/keyboard

Pion uses public Google STUN by default (`stun:stun.l.google.com:19302`); add a TURN server to its config if you have peers on networks that block UDP entirely (corporate LANs, some hotel WiFi).

## API surface (Node side)

```ts
import { spawn } from "node:child_process";
import { mouse, keyboard, Button, Point } from "@nut-tree-fork/nut-js";

export class RemoteScreenSession {
  private rtc = spawn("axl/native/openclaw-rtc", [], { stdio: ["pipe", "pipe", "inherit"] });

  constructor() {
    this.rtc.stdout!.on("data", (chunk) => this.onMessage(chunk.toString()));
  }

  // Call from the controlled machine: produce an SDP offer to send to the peer.
  async startSharing(opts: { fps?: number; bitrateKbps?: number } = {}): Promise<string> {
    return await this.rpc({ op: "create-offer", video: { source: "screen", fps: opts.fps ?? 15, bitrateKbps: opts.bitrateKbps ?? 2500 } });
  }

  // Call from the controlling machine: respond to an SDP offer with an answer.
  async respondToOffer(sdp: string): Promise<string> {
    return await this.rpc({ op: "answer-offer", sdp });
  }

  async addIceCandidate(candidate: string): Promise<void> {
    await this.rpc({ op: "ice-candidate", candidate });
  }

  // Send an input event from controller → controlled machine.
  async sendInput(event: { type: "click"; x: number; y: number } | { type: "type"; text: string } | { type: "key"; key: string }): Promise<void> {
    await this.rpc({ op: "datachannel-send", label: "input", data: JSON.stringify(event) });
  }

  // On the controlled side, the executor that runs incoming inputs.
  private async executeInput(raw: string) {
    const ev = JSON.parse(raw);
    switch (ev.type) {
      case "click":
        await mouse.move([new Point(ev.x, ev.y)]);
        await mouse.click(Button.LEFT);
        break;
      case "type":
        await keyboard.type(ev.text);
        break;
      case "key":
        // ... pressHotkey, see computer-use.md
        break;
    }
  }

  private rpc(req: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const onData = (chunk: string) => {
        const msg = JSON.parse(chunk);
        if (msg.id !== id) return;
        this.rtc.stdout!.off("data", onData as any);
        msg.error ? reject(new Error(msg.error)) : resolve(msg.result);
      };
      this.rtc.stdout!.on("data", onData as any);
      this.rtc.stdin!.write(JSON.stringify({ ...req, id }) + "\n");
    });
  }

  private onMessage(line: string) {
    const msg = JSON.parse(line);
    if (msg.op === "datachannel-recv" && msg.label === "input") {
      this.executeInput(msg.data);
    }
  }
}
```

## Signaling over AXL (the missing wire)

Each side has an AXL pubkey. SDP and ICE candidates are short JSON blobs — POST them as A2A messages with `metadata.tool = "rtc-signaling"`:

```ts
async function sendSdp(peerPubkey: string, kind: "offer" | "answer" | "ice", payload: string) {
  await fetch(`http://127.0.0.1:9002/a2a/${peerPubkey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: `rtc-${kind}-${Date.now()}`,
          role: "user",
          parts: [{ kind: "data", data: { sdpKind: kind, payload } }],
          metadata: { fromRole: myRole, tool: "rtc-signaling" },
        },
      },
    }),
  });
}
```

The receiving side's `axl/agent.ts` already accepts inbound A2A messages — extend its handler to dispatch `tool === "rtc-signaling"` messages into `session.respondToOffer()` / `session.addIceCandidate()`.

## When to fall back

| failure signal | fall back to |
|---|---|
| ICE gathering completes with no usable candidate (both peers behind symmetric NAT, no TURN) | Add a TURN server to Pion's config, or fall back to `apache-guacamole` running on a publicly reachable host |
| Video bitrate spikes / stalls (CPU pegged on the encoder) | Drop fps to 5–8, increase keyframe interval. Last resort: `vnc` (uses much less bandwidth at the cost of latency). |
| Pion binary exits with `screen capture permission denied` | Re-prompt for macOS Screen Recording grant, then restart the sidecar. |
| Controller disconnects unexpectedly | The sidecar emits `op: "disconnected"` — close the session, prompt user before reopening. |

## Security

- Every WebRTC session is end-to-end encrypted (DTLS-SRTP), independent of whether signaling is encrypted. AXL adds another layer for the signaling SDPs.
- Validate the peer's identity at signaling time — only accept SDP offers from a peer whose AXL pubkey matches one in `peers.json`.
- The video stream contains the user's screen verbatim — Slack messages, password fields, everything. Treat the `RTCPeerConnection` lifetime as a `consent window`: surface a tray icon "remote viewing active" with a hard kill button.
- Datachannel input events should still pass through the per-action approval gate (see `axl/mcp-servers/permission.ts`) for sensitive operations.

## Performance

- Typical: 15 fps screen at 1080p, ~2.5 Mbps, ~80–150ms RTT (P2P with both on residential broadband).
- Each input event is < 100 bytes; datachannel adds < 5ms over the underlying RTT.
- Pion's CPU footprint: ~8% of one core on M-series Mac for 1080p15 H.264 encoding. Drop to 5fps for ~2%.

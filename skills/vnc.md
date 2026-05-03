---
name: vnc
description: Remote screen + input via the RFB (Remote Framebuffer) protocol. Older than WebRTC, works without ICE/STUN, every OS has a server built-in or one apt-get away.
priority: fallback-when-webrtc-fails
when_to_use: WebRTC can't establish (corporate firewalls block UDP, no TURN server available). You want a 30-year-old protocol that any client (vncviewer, RealVNC, even iOS/Android apps) can connect to. You're on a LAN or have a tunneled TCP path (AXL Yggdrasil IPv6 works).
when_to_skip: You need < 100ms latency or you're streaming HD video — VNC is sluggish at high resolution because it's pixel-diff based, not video-codec based. Use `webrtc` instead.
---

# vnc

Two halves: a **VNC server** on the controlled machine (built into macOS as Screen Sharing; install on Linux/Windows) and a **VNC client** on the controller. Both speak the RFB protocol over TCP.

For OpenClaw the controller is the AI agent, not a human, so the client is a Node library that decodes framebuffer updates → PNG and sends mouse/key events.

## Architecture

```
┌──────────────────────────────┐                ┌────────────────────────────┐
│  Controlled (macOS)          │                │  Controller (Node + AI)    │
│  ↳ macOS Screen Sharing      │     RFB        │  ↳ vnc-rfb-client (npm)    │
│    binds to :5900            │ ←────────────→ │  ↳ feeds frames to vision  │
│                              │   over TCP     │  ↳ posts input events      │
│                              │                │                            │
└──────────────────────────────┘                └────────────────────────────┘
                ↑ AXL Yggdrasil IPv6 routes the TCP between peers (NAT-traversed)
```

## Required setup

### Controlled machine (macOS)

System Settings → General → Sharing → toggle **Screen Sharing** ON. Click *Computer Settings…* → tick *VNC viewers may control screen with password* → set a strong password.

Verify:
```bash
launchctl list | grep -i screensharing   # should show com.apple.screensharing
nc -vz localhost 5900                    # should succeed
```

For Linux: `sudo apt install x11vnc` (X11) or `wayvnc` (Wayland). For Windows: TightVNC Server.

### Controller machine

```bash
npm install vnc-rfb-client
```

`vnc-rfb-client` is a maintained pure-JS RFB client. Decodes Raw / CopyRect / Hextile / Tight / ZRLE encodings, supports VNC auth + Apple's TightVNC variant.

## API surface

```ts
import VncClient from "vnc-rfb-client";
import { writeFileSync } from "node:fs";

export class VncSession {
  private client: VncClient;
  private latestFrame: Buffer | null = null;

  constructor(opts: { host: string; port?: number; password: string }) {
    this.client = new VncClient({
      debug: false,
      fps: 5,                              // request 5 fps; server may send less
      encodings: [                         // priority order
        VncClient.consts.encodings.copyRect,
        VncClient.consts.encodings.zrle,
        VncClient.consts.encodings.hextile,
        VncClient.consts.encodings.raw,
        VncClient.consts.encodings.pseudoDesktopSize,
      ],
    });

    this.client.on("frameUpdated", (frame: Buffer) => {
      this.latestFrame = frame;            // raw RGBA framebuffer
    });

    this.client.connect({
      host: opts.host,
      port: opts.port ?? 5900,
      password: opts.password,
    });
  }

  // Snapshot the current framebuffer as a PNG for the vision model.
  async screenshot(): Promise<Buffer> {
    if (!this.latestFrame) throw new Error("no frame yet — wait for first frameUpdated");
    return rgbaToPng(this.latestFrame, this.client.clientWidth, this.client.clientHeight);
  }

  // Mouse — buttonMask: bit 0 = left, bit 1 = middle, bit 2 = right.
  click(x: number, y: number, button: "left" | "right" | "middle" = "left") {
    const mask = { left: 1, middle: 2, right: 4 }[button];
    this.client.sendPointerEvent(x, y, mask);              // press
    this.client.sendPointerEvent(x, y, 0);                  // release
  }

  move(x: number, y: number) {
    this.client.sendPointerEvent(x, y, 0);
  }

  // Keyboard — key is an X11 keysym (numeric). vnc-rfb-client provides constants.
  type(text: string) {
    for (const ch of text) {
      const keysym = ch.charCodeAt(0);                      // ASCII range maps directly
      this.client.sendKeyEvent(keysym, true);
      this.client.sendKeyEvent(keysym, false);
    }
  }

  pressHotkey(combo: string) {
    // e.g. "ctrl+c" → 0xffe3 (Control_L), 0x63 (c)
    const KEYSYMS: Record<string, number> = {
      ctrl: 0xffe3, shift: 0xffe1, alt: 0xffe9, cmd: 0xffe7,
      enter: 0xff0d, return: 0xff0d, tab: 0xff09, escape: 0xff1b,
      space: 0x20, backspace: 0xff08, delete: 0xffff,
    };
    const parts = combo.toLowerCase().split("+");
    const keys = parts.map(p => KEYSYMS[p] ?? p.charCodeAt(0));
    keys.forEach(k => this.client.sendKeyEvent(k, true));
    keys.reverse().forEach(k => this.client.sendKeyEvent(k, false));
  }

  close() { this.client.disconnect(); }
}

function rgbaToPng(rgba: Buffer, width: number, height: number): Buffer {
  // Use sharp or pngjs for the conversion. Cheap, ~10ms for 1080p.
  // import sharp from "sharp";
  return require("sharp")(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
```

## Connecting through AXL (no public IP needed)

Because Yggdrasil (which AXL builds on) gives every node a routable IPv6 address regardless of NAT, the VNC server on `[<peer-ipv6>]:5900` is reachable from any other AXL node:

```ts
// Discover the peer's Yggdrasil IPv6 from /topology on the LOCAL AXL node.
// (peer's own AXL exposes its address; query their /topology via A2A.)
const topology = await fetch("http://127.0.0.1:9002/topology").then(r => r.json());
// peer info comes through here once their pubkey is in peers.json

// Connect VNC to peer's Yggdrasil address:
const session = new VncSession({
  host: "203:a715:4888:f3da:ae90:54b1:91a6:961e",  // peer's IPv6
  port: 5900,
  password: process.env.VNC_PASSWORD!,
});
```

The AXL/Yggdrasil mesh does the routing; you don't need STUN/TURN/UPnP. Only requirement: both peers are connected to the AXL network.

## Auth & secrets

VNC's built-in auth is **DES with an 8-character password limit** — weak by 2025 standards. Three production-grade approaches:

1. **Apple ARD authentication** (Diffie-Hellman + AES on macOS Screen Sharing). `vnc-rfb-client` supports it via `auth: "apple"`. Strong, but Apple-only on the server side.
2. **Tunnel VNC over SSH**: `ssh -L 5901:localhost:5900 user@<yggdrasil-ipv6>`, then VNC client connects to `localhost:5901`. Adds AES-256, key auth.
3. **Tunnel VNC over the AXL/Yggdrasil session itself** — Yggdrasil traffic is end-to-end ed25519+ChaCha20-encrypted between authenticated peers. The AXL pubkey check at session setup is your strong-auth layer.

Pick (3) for OpenClaw — it composes with everything you already have.

## When to fall back

| failure signal | fall back to |
|---|---|
| Latency > 500ms or fps < 2 over a long-haul connection | Switch to `webrtc` — RFB pixel-diff is bandwidth-heavy at high resolution |
| User wants to view from a phone or just-a-browser | Switch to `apache-guacamole` (it accepts VNC server-side, serves browser-side) |
| Server-side rejects auth | Verify password / Apple ARD support; if both fail, surface to user |
| Encoding negotiation fails (`unsupportedEncoding`) | Drop to RAW encoding only — works everywhere, slow |

## Security

- VNC auth is the weakest link — always tunnel through AXL/Yggdrasil or SSH; never expose port 5900 on a public IP.
- macOS Screen Sharing has a per-user permission (System Settings → Screen Sharing → Allow access for: …) — set this to specific Apple IDs, not "All users."
- Frame buffers may contain PII — log the *connection event* but never the framebuffer bytes.

## Performance

- Typical: 5–10 fps at 1440p over residential broadband, ~500 KB/s with ZRLE encoding.
- CPU: ~3% of one core for the client decoder.
- For higher framerate or HD video, prefer `webrtc`.

# AXL 3-Mac Demo — Setup Runbook (A2A flow)

Phase 1 of Right-Hand AI: prove AXL transport works across 3 Macs on the same WiFi, using the **A2A protocol** (`/a2a/<peer>` endpoint) for structured agent-to-agent messaging.

- **`user`** — Mac A, hub + display. Listens, never sends. Sees the conversation between the two agents on screen via the CC pattern.
- **`agent-b`** — Mac B, AI agent. Talks to `agent-c`. CCs `user`.
- **`agent-c`** — Mac C, AI agent. Talks to `agent-b`. CCs `user`.

Each Mac runs **two processes**:
1. **AXL node** (Go binary) — handles encrypted P2P transport
2. **A2A agent server** (`axl/agent.ts` via Express) — receives inbound `/a2a/{peer}` calls, logs incoming, replies (echo for agents, ACK for user)

`npm run axl:start` launches both together.

---

## Prerequisites (per Mac)

- macOS (any recent version)
- Node.js 20+
- 5 minutes for first-time setup (Homebrew + Go + AXL build + npm deps)

`scripts/setup-axl.sh` handles Homebrew, Go, jq, openssl. `npm install` handles `@a2a-js/sdk` + `express` + `tsx`.

---

## One-time setup

All 3 Macs peer to **Gensyn's public bootstrap nodes** and join the global Yggdrasil mesh. No LAN coordination, no IP juggling, no firewall fights — the only requirement is that each Mac has internet access. Discovery between our 3 nodes is by pubkey (already in `axl/peers.json`).

### 1. Pull + install on each Mac

```bash
git pull
npm install            # picks up @a2a-js/sdk, express, tsx, etc.
```

### 2. On each Mac: run setup with the role

```bash
# Mac A (user):
MACHINE_ROLE=user npm run axl:setup

# Mac B (agent-b):
MACHINE_ROLE=agent-b npm run axl:setup

# Mac C (agent-c):
MACHINE_ROLE=agent-c npm run axl:setup
```

No `USER_IP` needed. No `nc -vz` firewall hunt. Each Mac dials Gensyn's public bootstrap nodes directly.

This installs Homebrew/Go/jq if missing, clones `gensyn-ai/axl` into `.axl/`, builds the AXL binary, generates an ed25519 key, and writes `axl/node-config.json` (peers to `tls://34.46.48.224:9001` + `tls://136.111.135.206:9001`).

### Why this works across any networks

Yggdrasil (the protocol AXL wraps) is a global encrypted overlay. Once you peer to ANY node already in the mesh, you can address any other mesh node by its pubkey. Gensyn's public bootstrap nodes are always in the mesh, so all you need is internet access.

Tradeoff: `/topology` will show other AXL users on the public mesh (not just our 3 Macs). We ignore them — `axl:send` always addresses by pubkey, which is unique. The Discord chat noted Convergecast can be unreliable on public mesh due to ephemeral peers, but we don't use it — `/send` and `/a2a` to specific pubkeys work fine.

### 3. On each Mac: start AXL + A2A agent

```bash
npm run axl:start
```

This launches both processes:
- AXL node prints its `Public Key` and listening address
- A2A agent server prints `[A2A] Listening on http://127.0.0.1:9004`
- After ~3 seconds, the script writes the pubkey into your role's entry in `axl/peers.json`, copies it to your clipboard, and stays running

**Leave this terminal open** — both processes have to keep running.

⚠️ **First time only**: macOS may pop "Do you want the application 'node' to accept incoming network connections?" → click **Allow** (or just toggle the firewall off). With public-bootstrap mode all Macs dial outbound, but the prompt may still appear depending on Mac config.

### 4. Exchange pubkeys

Each Mac pastes its pubkey into Discord. On **one machine** (e.g. user):

1. Edit `axl/peers.json`, paste each role's pubkey into its `pubkey` field
2. Commit + push

On the other Macs (in a NEW terminal — leave the start terminal alone):

```bash
git pull
```

No restart needed — `axl:send` reads pubkeys at send time.

---

## The demo (A2A flow)

The agent.ts server already logs incoming messages — no separate `axl:listen` needed. Just open one extra terminal on each Mac and run:

### Mac A (user)

The terminal running `npm run axl:start` is your display. Watch for incoming messages — both agents' messages (with `(cc)` tag) appear here.

```
2026-05-01T12:34:56.789Z [agent-b (cc) → user] hello from agent-b
2026-05-01T12:34:58.012Z [agent-c (cc) → user] reply from agent-c
```

### Mac B (agent-b)

Already running `npm run axl:start` in terminal 1. In a new terminal:

```bash
npm run axl:send -- agent-c "hello from agent-b"
```

You'll see:
```
2026-05-01T12:34:56.789Z → agent-c    reply: [echo] hello from agent-b
2026-05-01T12:34:56.812Z cc → user  reply: received
```

The "reply" line is what the receiver returned (echo from agents, "received" from user). That's the round-trip confirmation A2A gives you that raw `/send` doesn't.

### Mac C (agent-c)

Same as Mac B but talking to agent-b:

```bash
npm run axl:send -- agent-b "got it, here's a reply"
```

Continue back-and-forth as long as you want.

### `--` separator

Note the `--` after `axl:send` — tells npm "everything after this is for the script." Always use:

```bash
npm run axl:send -- <target-role> "<message>"
```

Or call directly:

```bash
npx tsx scripts/axl-send.ts agent-c "hello"
```

---

## What success looks like

- Each agent's `axl:start` terminal shows messages from the other agent: `[agent-c → agent-b] hello back`
- User's `axl:start` terminal shows BOTH directions, tagged `(cc)`
- Each `axl:send` prints the receiver's reply (echo for agents, "received" for user)
- Running `curl -s http://127.0.0.1:9002/topology | jq` on any Mac shows all 3 nodes in `peers[]` with `up: true`

---

## Troubleshooting

### `axl:setup` fails: `MACHINE_ROLE must be one of...`

Set the env var before running:
```bash
MACHINE_ROLE=user npm run axl:setup
```

### `axl:setup` fails: `Phase 1 is macOS-only`

You're on Linux/WSL/Windows. Phase 1 is intentionally Mac-only. Switching to Mac is the easiest path.

### `axl:start` shows no peers connecting

In public-bootstrap mode, you should see at least the two Gensyn bootstrap peers in `/topology` with `"up": true`:
```bash
curl -s http://127.0.0.1:9002/topology | python3 -m json.tool | head -30
```

If neither bootstrap is up, check:
1. **Internet access** — the Mac needs outbound TCP to `34.46.48.224:9001` and `136.111.135.206:9001`.
2. **Outbound firewall blocking** — venue networks sometimes block non-standard ports. Try the demo on a phone hotspot.
3. **AXL node binary missing or stale** — re-run `npm run axl:setup`.

### `axl:send` errors: `Card fetch failed for agent-c... HTTP 502`

AXL can't reach the target peer's A2A server. Check:
1. Target Mac's `axl:start` is running (both processes)
2. Target's pubkey in `peers.json` is correct
3. The TLS mesh is healthy — `/topology` shows target as `up: true`

### `axl:send` errors: `Card fetch failed... HTTP 504` or hangs ~30s

The target's AXL node received the call but the local A2A server (Express on :9004) isn't responding. Check the target's `axl:start` log for `[A2A] Listening on http://127.0.0.1:9004`. If absent, `axl/agent.ts` failed to start — check error in the same log.

### `axl:send` works but user sees nothing

CC failed:
1. `user.pubkey` is empty in `peers.json` — fill it, push, pull on agents.
2. User's A2A server isn't running.

`axl:send` prints `cc → user  reply: received` per send when CC succeeds. Watch for that line.

### `axl:start` says `[A2A] Listening on :9004` but agent.ts crashes

Most likely missing dep. Run:
```bash
npm install
```

### A2A messages appear but sender label says `?`

The sender forgot to set `metadata.fromRole`. Our `axl-send.ts` always sets it, so this only happens if you POST to AXL manually or use a different client.

---

## What's next (out of scope for Phase 1)

- **Phase 2**: cross-node MCP routing (`POST /mcp/<peer>/<service>`) — a specialist on agent-b invokes a tool exposed by agent-c's MCP server through AXL
- **Phase 3**: GossipSub broadcast — replace explicit CC with pub/sub topic the user subscribes to
- **Phase 4**: wire the Next.js chat UI (`pages/index.tsx`) to drive `axl:send` and stream agent.ts logs back
- **Phase 5**: replace one Mac with native Windows/WSL for the eventual non-tech user demo
- **Phase 6**: real specialist agents on 0G Compute (planning, research, troubleshoot personas) instead of echo

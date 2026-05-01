# AXL 3-Mac Demo — Setup Runbook (A2A flow)

Phase 1 of Right-Hand AI: prove AXL transport works across 3 Macs on the same WiFi, using the **A2A protocol** (`/a2a/<peer>` endpoint) for structured agent-to-agent messaging.

- **`spectator`** — Mac A, hub + display. Listens, never sends. Sees the conversation between the two agents on screen via the CC pattern.
- **`agent-b`** — Mac B, AI agent. Talks to `agent-c`. CCs `spectator`.
- **`agent-c`** — Mac C, AI agent. Talks to `agent-b`. CCs `spectator`.

Each Mac runs **two processes**:
1. **AXL node** (Go binary) — handles encrypted P2P transport
2. **A2A agent server** (`axl/agent.ts` via Express) — receives inbound `/a2a/{peer}` calls, logs incoming, replies (echo for agents, ACK for spectator)

`npm run axl:start` launches both together.

---

## Prerequisites (per Mac)

- macOS (any recent version)
- Node.js 20+
- 5 minutes for first-time setup (Homebrew + Go + AXL build + npm deps)

`scripts/setup-axl.sh` handles Homebrew, Go, jq, openssl. `npm install` handles `@a2a-js/sdk` + `express` + `tsx`.

---

## One-time setup

### 1. Pick LAN IPs and fill `axl/peers.json`

On each Mac, find the LAN IP:

```bash
ifconfig getifaddr en0       # WiFi
# or:
ifconfig getifaddr en1       # ethernet
```

On **one Mac** (any of them — the spectator is fine), edit `axl/peers.json` with the 3 real LAN IPs:

```json
{
  "spectator": { "lanIp": "192.168.1.10", "apiPort": 9002, "pubkey": "" },
  "agent-b":   { "lanIp": "192.168.1.11", "apiPort": 9002, "pubkey": "" },
  "agent-c":   { "lanIp": "192.168.1.12", "apiPort": 9002, "pubkey": "" }
}
```

`pubkey` stays empty for now — `axl:start` fills these in step 4. Commit + push.

### 2. On each Mac: pull, install deps, run setup

```bash
git pull
npm install            # picks up @a2a-js/sdk, express, tsx, etc.
```

Then on each Mac, run `axl:setup` with that machine's role:

```bash
# Mac A:
MACHINE_ROLE=spectator npm run axl:setup

# Mac B:
MACHINE_ROLE=agent-b   npm run axl:setup

# Mac C:
MACHINE_ROLE=agent-c   npm run axl:setup
```

This installs Homebrew/Go/jq if needed, clones `gensyn-ai/axl` into `.axl/`, builds the AXL binary, generates an ed25519 key, and writes `axl/node-config.json` for that machine's role (with `a2a_addr` set so AXL forwards inbound A2A calls to our Express server).

### 3. On each Mac: start AXL + A2A agent

```bash
npm run axl:start
```

This launches both processes:
- AXL node prints its `Public Key` and listening address
- A2A agent server prints `[A2A] Listening on http://127.0.0.1:9004`
- After ~3 seconds, the script writes the pubkey into your role's entry in `axl/peers.json`, copies it to your clipboard, and stays running

**Leave this terminal open** — both processes have to keep running.

⚠️ **First time only**: macOS pops "Do you want the application 'node' to accept incoming network connections?" → click **Allow**. (Spectator only — agents dial outbound.)

### 4. Exchange pubkeys

Each Mac pastes its pubkey into Discord. On **one machine** (e.g. spectator):

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

### Mac A (spectator)

The terminal running `npm run axl:start` is your display. Watch for incoming messages — both agents' messages (with `(cc)` tag) appear here.

```
2026-05-01T12:34:56.789Z [agent-b (cc) → spectator] hello from agent-b
2026-05-01T12:34:58.012Z [agent-c (cc) → spectator] reply from agent-c
```

### Mac B (agent-b)

Already running `npm run axl:start` in terminal 1. In a new terminal:

```bash
npm run axl:send -- agent-c "hello from agent-b"
```

You'll see:
```
2026-05-01T12:34:56.789Z → agent-c    reply: [echo] hello from agent-b
2026-05-01T12:34:56.812Z cc → spectator  reply: received
```

The "reply" line is what the receiver returned (echo from agents, "received" from spectator). That's the round-trip confirmation A2A gives you that raw `/send` doesn't.

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
- Spectator's `axl:start` terminal shows BOTH directions, tagged `(cc)`
- Each `axl:send` prints the receiver's reply (echo for agents, "received" for spectator)
- Running `curl -s http://127.0.0.1:9002/topology | jq` on any Mac shows all 3 nodes in `peers[]` with `up: true`

---

## Troubleshooting

### `axl:setup` fails: `MACHINE_ROLE must be one of...`

Set the env var before running:
```bash
MACHINE_ROLE=spectator npm run axl:setup
```

### `axl:setup` fails: `Phase 1 is macOS-only`

You're on Linux/WSL/Windows. Phase 1 is intentionally Mac-only. Switching to Mac is the easiest path.

### `axl:start` runs but `peers[].up: false` everywhere

TLS handshake never completed. Likely:
1. **Firewall** — Mac A (spectator) blocking port 7001. System Settings → Network → Firewall, allow `node`.
2. **Wrong LAN IP** — re-check `ifconfig getifaddr en0` on each Mac.
3. **Spectator listening on `127.0.0.1`** — re-run `MACHINE_ROLE=spectator npm run axl:setup`.

Quick test from an agent:
```bash
nc -vz <spectator-LAN-IP> 7001
```
Times out → firewall. Refused → spectator's node not running.

### `axl:send` errors: `Card fetch failed for agent-c... HTTP 502`

AXL can't reach the target peer's A2A server. Check:
1. Target Mac's `axl:start` is running (both processes)
2. Target's pubkey in `peers.json` is correct
3. The TLS mesh is healthy — `/topology` shows target as `up: true`

### `axl:send` errors: `Card fetch failed... HTTP 504` or hangs ~30s

The target's AXL node received the call but the local A2A server (Express on :9004) isn't responding. Check the target's `axl:start` log for `[A2A] Listening on http://127.0.0.1:9004`. If absent, `axl/agent.ts` failed to start — check error in the same log.

### `axl:send` works but spectator sees nothing

CC failed:
1. `spectator.pubkey` is empty in `peers.json` — fill it, push, pull on agents.
2. Spectator's A2A server isn't running.

`axl:send` prints `cc → spectator  reply: received` per send when CC succeeds. Watch for that line.

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
- **Phase 3**: GossipSub broadcast — replace explicit CC with pub/sub topic the spectator subscribes to
- **Phase 4**: wire the Next.js chat UI (`pages/index.tsx`) to drive `axl:send` and stream agent.ts logs back
- **Phase 5**: replace one Mac with native Windows/WSL for the eventual non-tech user demo
- **Phase 6**: real specialist agents on 0G Compute (planning, research, troubleshoot personas) instead of echo

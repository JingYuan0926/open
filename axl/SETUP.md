# AXL 3-Mac Demo — Setup Runbook

Phase 1 of Right-Hand AI: prove AXL transport works across 3 Macs on the same WiFi.

- **`spectator`** — Mac A, hub + display. Listens, never sends. Sees the conversation between the two agents on screen.
- **`agent-b`** — Mac B, AI agent. Talks to `agent-c`. CCs `spectator`.
- **`agent-c`** — Mac C, AI agent. Talks to `agent-b`. CCs `spectator`.

Once peered, AXL routes `agent-b ↔ agent-c` traffic transparently through `spectator` (Yggdrasil mesh).

---

## Prerequisites (per Mac)

- macOS (any recent version)
- Node.js 20+
- 5 minutes for first-time setup (Homebrew + Go + AXL build)

`scripts/setup-axl.sh` will install Homebrew, Go, jq, and openssl if missing.

---

## One-time setup

### 1. User picks LAN IPs and fills `axl/peers.json`

On each Mac, find the LAN IP:

```bash
ifconfig getifaddr en0       # WiFi
# or:
ifconfig getifaddr en1       # ethernet
```

Edit `axl/peers.json` with the 3 real LAN IPs. Commit + push to GitHub.

```json
{
  "spectator": { "lanIp": "192.168.1.10", "apiPort": 9002, "pubkey": "" },
  "agent-b":   { "lanIp": "192.168.1.11", "apiPort": 9002, "pubkey": "" },
  "agent-c":   { "lanIp": "192.168.1.12", "apiPort": 9002, "pubkey": "" }
}
```

`pubkey` stays empty for now — it gets filled in step 4.

### 2. Each Mac: pull, install deps, run setup

On every Mac:

```bash
git pull
npm install
```

Then on each Mac, run `axl:setup` with that machine's role:

```bash
# Mac A (spectator):
MACHINE_ROLE=spectator npm run axl:setup

# Mac B (agent-b):
MACHINE_ROLE=agent-b npm run axl:setup

# Mac C (agent-c):
MACHINE_ROLE=agent-c npm run axl:setup
```

This installs Homebrew/Go/jq if needed, clones `gensyn-ai/axl` into `.axl/`, builds the binary, generates an ed25519 key, and writes `axl/node-config.json` for that machine's role.

### 3. Each Mac: start the node

```bash
npm run axl:start
```

The node prints its public key on startup. The script also:
- Writes the pubkey into your role's entry in `axl/peers.json`
- Copies the pubkey to your clipboard (`pbcopy`)
- Keeps the node running in the foreground (Ctrl+C to stop)

**Leave this terminal open** — the node needs to keep running.

### 4. Exchange pubkeys

Each Mac pastes its pubkey into Discord. Pick **one machine** (e.g. the spectator) to:

1. Paste all 3 pubkeys into `axl/peers.json` under each role's `pubkey` field
2. Commit + push

Then on the other 2 Macs:

```bash
git pull
```

(No restart needed — `axl:send` and `axl:listen` read pubkeys at use time.)

### 5. First time only: macOS firewall

When the spectator's node starts, macOS will pop up:

> **"Do you want the application 'node' to accept incoming network connections?"**

Click **Allow**. If the firewall is set to block all incoming connections, go to **System Settings → Network → Firewall → Options** and explicitly allow `.axl/node`.

The agent Macs only dial OUTbound, so they don't need this.

---

## The demo (60 seconds)

Each Mac needs **3 terminals**: one running the node, one for `axl:listen`, one for `axl:send` (agents only).

### Mac A (spectator)

```bash
# terminal 1 — node (already running from setup step 3)

# terminal 2:
npm run axl:listen
```

You'll see incoming messages from both agents:

```
2026-05-01T12:34:56Z [agent-b] hello from b
2026-05-01T12:34:58Z [agent-c] got it, here's a reply
```

### Mac B (agent-b)

```bash
# terminal 1 — node already running

# terminal 2:
npm run axl:listen

# terminal 3:
npm run axl:send -- agent-c "hello from b"
```

### Mac C (agent-c)

```bash
# terminal 1 — node already running

# terminal 2:
npm run axl:listen

# terminal 3:
npm run axl:send -- agent-b "got it, here's a reply"
```

Continue back-and-forth as long as you want.

### `--` separator

Note the `--` after `axl:send`. That tells `npm` "everything after this is for the script, not for npm itself." Without it, npm sometimes swallows args that look like flags. Always use:

```bash
npm run axl:send -- <target-role> "<message>"
```

Or call the bash script directly:

```bash
bash scripts/axl-cc-send.sh agent-c "hello"
```

---

## What success looks like

- Each agent's `axl:listen` shows the **other** agent's messages within ~1 second.
- The spectator's `axl:listen` shows **both** agents' messages.
- Each message is labeled `[agent-b]` or `[agent-c]` correctly.
- Running `curl -s http://127.0.0.1:9002/topology | jq` on any Mac shows all 3 nodes in `peers[]` with `up: true`.

---

## Troubleshooting

### `axl:setup` fails: `MACHINE_ROLE must be one of...`

Set the env var before running:

```bash
MACHINE_ROLE=spectator npm run axl:setup
```

### `axl:setup` fails: `Phase 1 is macOS-only`

You're on Linux/WSL/Windows. Phase 1 is intentionally Mac-only — see the Phase 1 plan. Switching to Mac is the easiest path.

### `axl:start` runs but `peers[].up: false` everywhere

The TLS handshake never completed. Likely causes:

1. **Firewall** — Mac A (spectator) is blocking inbound port 7001. Check System Settings → Network → Firewall, allow `.axl/node`.
2. **Wrong LAN IP** — check `axl/peers.json` matches `ifconfig getifaddr en0` on each Mac. WiFi IPs change between networks.
3. **Spectator listening on `127.0.0.1` instead of `0.0.0.0`** — re-run `MACHINE_ROLE=spectator npm run axl:setup` to regenerate `node-config.json`.

Quick test from an agent Mac:

```bash
nc -vz <spectator-LAN-IP> 7001
```

If "operation timed out" → firewall. If "connection refused" → spectator's node isn't running.

### `axl:send` says `Target role 'agent-c' has no pubkey in peers.json`

The other agent hasn't run `axl:start` yet, or `peers.json` wasn't updated/pulled. Make sure:

1. Each Mac has run `npm run axl:start`
2. The pubkey from `axl:start`'s output ended up in `axl/peers.json`
3. Every Mac has `git pull`'d after pubkeys were committed

### `axl:send` returns HTTP 200 but `axl:listen` shows nothing

The message reached AXL but was routed to a different stream. Cause: the JSON payload contains a `service` field, which AXL's multiplexer dispatches to the MCP router instead of the recv queue.

Our `axl-cc-send.sh` doesn't add `service`, so this only happens if you're sending custom payloads. Check the payload doesn't have top-level `"service"`.

### Spectator only sees one agent's messages

CC failed. Causes:

1. `spectator.pubkey` is empty in `peers.json` when `axl:send` ran — add it, push, pull on agents.
2. Spectator's node isn't actually running.

`axl-cc-send.sh` prints `cc → spectator ✓` per send when CC succeeds. Watch for that line.

### `tsx scripts/resolve-peer.ts` errors

Likely `node_modules` aren't installed: `npm install` first. Or the script's `import` from `../axl/axl.js` can't find the file — ensure `axl/axl.ts` exists (it ships in the repo).

---

## What's next (out of scope for Phase 1)

- **Phase 2**: switch from raw `/send` to AXL's native `/a2a/<peer>` endpoint for proper task lifecycle (submitted → working → completed)
- **Phase 3**: cross-node MCP routing (`POST /mcp/<peer>/<service>`) — agent on Mac C invokes a tool on the spectator's machine
- **Phase 4**: wire the Next.js chat UI to drive `axl:send` and display `axl:listen` output
- **Phase 5+**: replace the spectator Mac with native Windows/WSL for the eventual non-tech user demo

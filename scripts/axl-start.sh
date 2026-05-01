#!/usr/bin/env bash
# scripts/axl-start.sh — start AXL node + A2A agent server, capture our pubkey, run in foreground.
#
# Usage:
#   npm run axl:start
#
# Reads MACHINE_ROLE from .axl/role (written by setup-axl.sh).
# Launches two processes:
#   1. AXL node (Go binary) — TLS mesh + HTTP API on api_port
#   2. A2A agent server (axl/agent.ts via tsx) — Express on :9004
# Then queries /topology, writes our_public_key into axl/peers.json, copies to clipboard,
# and tails both processes until Ctrl+C.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

say()  { printf "\033[36m[start]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[start]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[31m[start]\033[0m %s\n" "$*" >&2; exit 1; }

ROLE_FILE="$ROOT/.axl/role"
[[ -f "$ROLE_FILE" ]] || die "Run 'npm run axl:setup' first (.axl/role missing)."
ROLE=$(cat "$ROLE_FILE")

CONFIG="$ROOT/axl/node-config.json"
[[ -f "$CONFIG" ]] || die "axl/node-config.json missing. Run 'npm run axl:setup' first."

NODE_BIN="$ROOT/.axl/node"
[[ -x "$NODE_BIN" ]] || die ".axl/node binary missing. Run 'npm run axl:setup' first."

PEERS="$ROOT/axl/peers.json"
API_PORT=$(jq -r ".\"$ROLE\".apiPort" "$PEERS")

say "Starting AXL node (role=$ROLE, api=$API_PORT) + A2A agent server (:9004)"
say "Logs follow — Ctrl+C to stop both."
echo ""

# --- 1. AXL node (Go binary) ---
"$NODE_BIN" -config "$CONFIG" &
NODE_PID=$!

# --- 2. A2A agent server (Express via tsx) ---
# Wait briefly so the AXL node prints its banner first.
sleep 0.5
( cd "$ROOT" && npx --no-install tsx axl/agent.ts ) &
AGENT_PID=$!

# Cleanup on Ctrl+C / SIGTERM: kill both.
cleanup() {
  echo
  say "Stopping (node=$NODE_PID, agent=$AGENT_PID)…"
  kill "$NODE_PID" "$AGENT_PID" 2>/dev/null || true
  wait "$NODE_PID" 2>/dev/null || true
  wait "$AGENT_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Wait up to ~10s for /topology to be live.
PUBKEY=""
for _ in $(seq 1 20); do
  sleep 0.5
  if PUBKEY=$(curl -s --max-time 1 "http://127.0.0.1:${API_PORT}/topology" 2>/dev/null | jq -r '.our_public_key' 2>/dev/null); then
    if [[ -n "$PUBKEY" && "$PUBKEY" != "null" ]]; then
      break
    fi
  fi
done

if [[ -z "$PUBKEY" || "$PUBKEY" == "null" ]]; then
  warn "Couldn't read /topology after 10s. Node still starting? Continuing anyway."
else
  TMP=$(mktemp)
  jq ".\"$ROLE\".pubkey = \"$PUBKEY\"" "$PEERS" > "$TMP"
  mv "$TMP" "$PEERS"

  echo ""
  printf "\033[32m========================================\033[0m\n"
  printf "\033[32m role:    %s\033[0m\n" "$ROLE"
  printf "\033[32m pubkey:  %s\033[0m\n" "$PUBKEY"
  printf "\033[32m========================================\033[0m\n"
  echo ""

  if command -v pbcopy >/dev/null 2>&1; then
    echo -n "$PUBKEY" | pbcopy
    say "Pubkey copied to clipboard. Paste into Discord so others can update peers.json."
  fi

  say "axl/peers.json updated for role '$ROLE'. Commit + push when all 3 pubkeys are filled."
fi

echo ""
say "Both processes running (node=$NODE_PID, agent=$AGENT_PID). Ctrl+C to stop."

# Block until either dies; cleanup() catches the signal otherwise.
wait -n "$NODE_PID" "$AGENT_PID" 2>/dev/null || true
warn "One of the processes exited. Stopping the other…"
cleanup

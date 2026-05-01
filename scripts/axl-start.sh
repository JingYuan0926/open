#!/usr/bin/env bash
# scripts/axl-start.sh — start AXL node + A2A agent server, capture our pubkey, run in foreground.
#
# Usage:
#   npm run axl:start
#
# Reads MACHINE_ROLE from .axl/role (written by setup-axl.sh).
# Launches two processes:
#   1. AXL node (Go binary) — TLS mesh + HTTP API on api_port
#   2. A2A agent server (axl/agent.ts via local tsx) — Express on :9004
# Then queries /topology, writes our_public_key into axl/peers.json, copies to clipboard,
# and tails both processes until Ctrl+C.
#
# Pre-flight: kills any orphaned AXL / agent processes from previous runs so port
# bindings are clean. This avoids the "address already in use" + stale-pubkey trap.

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

TSX_BIN="$ROOT/node_modules/.bin/tsx"
[[ -x "$TSX_BIN" ]] || die "node_modules/.bin/tsx missing. Run 'npm install' first."

PEERS="$ROOT/axl/peers.json"
API_PORT=$(jq -r ".\"$ROLE\".apiPort" "$PEERS")
A2A_PORT=9004

# ---------- Pre-flight: kill any orphaned processes from previous runs ----------
say "Pre-flight: cleaning up any orphan AXL / agent processes…"
pkill -f "${ROOT}/.axl/node" 2>/dev/null || true
pkill -f "tsx axl/agent.ts" 2>/dev/null || true

# Free ports if anything is still bound (lsof on macOS).
for port in "$API_PORT" "$A2A_PORT" 7001 7002; do
  if command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -ti:"$port" 2>/dev/null || true)
    if [[ -n "$PIDS" ]]; then
      warn "  killing pids $PIDS holding :$port"
      kill -9 $PIDS 2>/dev/null || true
    fi
  fi
done

# Brief settle so the kernel releases the sockets.
sleep 1

say "Starting AXL node (role=$ROLE, api=$API_PORT) + A2A agent server (:$A2A_PORT)"
say "Logs follow — Ctrl+C to stop both."
echo ""

# ---------- 1. AXL node (Go binary) ----------
"$NODE_BIN" -config "$CONFIG" &
NODE_PID=$!

# Cleanup function used by signal trap and on partial failure.
cleanup() {
  echo
  say "Stopping (node=$NODE_PID, agent=${AGENT_PID:-?})…"
  [[ -n "${AGENT_PID:-}" ]] && kill "$AGENT_PID" 2>/dev/null || true
  kill "$NODE_PID" 2>/dev/null || true
  wait "$NODE_PID" 2>/dev/null || true
  [[ -n "${AGENT_PID:-}" ]] && wait "$AGENT_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Wait up to ~10s for /topology to be live AND for the running node to actually be ours.
PUBKEY=""
for _ in $(seq 1 20); do
  sleep 0.5
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    warn "AXL node died early. Check logs above. Exiting."
    exit 1
  fi
  if PUBKEY=$(curl -s --max-time 1 "http://127.0.0.1:${API_PORT}/topology" 2>/dev/null | jq -r '.our_public_key' 2>/dev/null); then
    if [[ -n "$PUBKEY" && "$PUBKEY" != "null" ]]; then
      break
    fi
  fi
done

if [[ -z "$PUBKEY" || "$PUBKEY" == "null" ]]; then
  warn "Couldn't read /topology after 10s — node may not be healthy."
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

# ---------- 2. A2A agent server (Express via local tsx — no npx wrapper) ----------
echo ""
say "Starting A2A agent server…"
"$TSX_BIN" axl/agent.ts &
AGENT_PID=$!

echo ""
say "Both processes running (node=$NODE_PID, agent=$AGENT_PID). Ctrl+C to stop."
echo ""

# Polling loop — survives even if either process restarts. Better than `wait -n`
# which races with subprocess setup and was triggering false cleanups.
while true; do
  sleep 2
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    warn "AXL node ($NODE_PID) exited — see logs above."
    cleanup
  fi
  if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    warn "A2A agent ($AGENT_PID) exited — see logs above. Restarting agent only…"
    "$TSX_BIN" axl/agent.ts &
    AGENT_PID=$!
    say "A2A agent restarted (pid=$AGENT_PID)."
  fi
done

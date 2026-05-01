#!/usr/bin/env bash
# scripts/axl-start.sh — start the AXL node, capture our pubkey, run in foreground.
#
# Usage:
#   npm run axl:start
#
# Reads MACHINE_ROLE from .axl/role (written by setup-axl.sh).
# After ~3s, queries /topology, writes our_public_key into axl/peers.json under our role,
# copies pubkey to clipboard, then keeps the node running in foreground (Ctrl+C to stop).

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

say "Starting AXL node (role=$ROLE, api=$API_PORT)…"
say "Logs follow — Ctrl+C to stop."
echo ""

# Start node in background; capture PID so we can wait on it after pubkey extraction.
"$NODE_BIN" -config "$CONFIG" &
NODE_PID=$!

# Make sure we kill the node if this script is interrupted.
trap 'echo; say "Stopping node (PID $NODE_PID)…"; kill "$NODE_PID" 2>/dev/null || true; wait "$NODE_PID" 2>/dev/null || true; exit 0' INT TERM

# Wait for /topology to be live (up to ~10s).
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
  # Update peers.json with our pubkey.
  TMP=$(mktemp)
  jq ".\"$ROLE\".pubkey = \"$PUBKEY\"" "$PEERS" > "$TMP"
  mv "$TMP" "$PEERS"

  echo ""
  printf "\033[32m========================================\033[0m\n"
  printf "\033[32m role:    %s\033[0m\n" "$ROLE"
  printf "\033[32m pubkey:  %s\033[0m\n" "$PUBKEY"
  printf "\033[32m========================================\033[0m\n"
  echo ""

  # Copy to clipboard (macOS pbcopy).
  if command -v pbcopy >/dev/null 2>&1; then
    echo -n "$PUBKEY" | pbcopy
    say "Pubkey copied to clipboard. Paste into Discord so others can update peers.json."
  fi

  say "axl/peers.json updated for role '$ROLE'. Commit + push when all 3 pubkeys are filled."
fi

echo ""
say "Node running (PID $NODE_PID). Press Ctrl+C to stop."

# Block until the node exits.
wait "$NODE_PID"

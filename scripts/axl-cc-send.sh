#!/usr/bin/env bash
# scripts/axl-cc-send.sh — agent-side: send a message to a target agent and CC the spectator.
#
# Usage:
#   npm run axl:send <target-role> "<message text>"
#   e.g. npm run axl:send agent-c "hello from agent-b"
#
# Reads MACHINE_ROLE from .axl/role.
# Looks up target.pubkey + spectator.pubkey from axl/peers.json.
# Sends the same JSON payload to both — that's the "CC pattern" so the spectator
# Mac sees the conversation even though AXL traffic is end-to-end encrypted.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

say()  { printf "\033[36m[send]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[send]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[31m[send]\033[0m %s\n" "$*" >&2; exit 1; }

if [[ $# -lt 2 ]]; then
  die "Usage: npm run axl:send <target-role> \"<message>\"
  target-role: spectator | agent-b | agent-c
  example:     npm run axl:send agent-c \"hello from agent-b\""
fi

TARGET_ROLE="$1"
MESSAGE="$2"

ROLE_FILE="$ROOT/.axl/role"
[[ -f "$ROLE_FILE" ]] || die "Run 'npm run axl:setup' first (.axl/role missing)."
MY_ROLE=$(cat "$ROLE_FILE")

if [[ "$MY_ROLE" == "spectator" ]]; then
  die "Spectator is receive-only by design. Use this script from an agent role."
fi

PEERS="$ROOT/axl/peers.json"
API_PORT=$(jq -r ".\"$MY_ROLE\".apiPort" "$PEERS")
TARGET_PK=$(jq -r ".\"$TARGET_ROLE\".pubkey" "$PEERS")
SPECTATOR_PK=$(jq -r '.spectator.pubkey' "$PEERS")

if [[ -z "$TARGET_PK" || "$TARGET_PK" == "null" ]]; then
  die "Target role '$TARGET_ROLE' has no pubkey in peers.json. Has the target run 'npm run axl:start' yet?"
fi
if [[ -z "$SPECTATOR_PK" || "$SPECTATOR_PK" == "null" ]]; then
  warn "Spectator has no pubkey in peers.json yet — sending without CC."
fi

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PAYLOAD=$(jq -nc \
  --arg from "$MY_ROLE" \
  --arg msg  "$MESSAGE" \
  --arg ts   "$TS" \
  '{from: $from, msg: $msg, ts: $ts}')

# 1. Send to target.
say "→ $TARGET_ROLE: $MESSAGE"
HTTP=$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST "http://127.0.0.1:${API_PORT}/send" \
  -H "X-Destination-Peer-Id: $TARGET_PK" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD")
if [[ "$HTTP" != "200" ]]; then
  die "Target send failed: HTTP $HTTP"
fi

# 2. CC the spectator (skip if target IS the spectator, or if spectator pubkey unknown).
if [[ "$TARGET_ROLE" != "spectator" && -n "$SPECTATOR_PK" && "$SPECTATOR_PK" != "null" ]]; then
  HTTP_CC=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "http://127.0.0.1:${API_PORT}/send" \
    -H "X-Destination-Peer-Id: $SPECTATOR_PK" \
    -H "Content-Type: application/json" \
    --data "$PAYLOAD")
  if [[ "$HTTP_CC" == "200" ]]; then
    say "  cc → spectator ✓"
  else
    warn "  cc → spectator FAILED (HTTP $HTTP_CC) — partner still got the message"
  fi
fi

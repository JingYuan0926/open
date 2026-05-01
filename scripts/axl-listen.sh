#!/usr/bin/env bash
# scripts/axl-listen.sh — poll /recv in a loop, pretty-print incoming messages.
#
# Usage:
#   npm run axl:listen
#
# Reads MACHINE_ROLE from .axl/role to know which API port to poll.
# Resolves each message's X-From-Peer-Id back to a role name via scripts/resolve-peer.ts.
# Output format:
#   2026-05-01T12:34:56Z [agent-b] hello from b
#
# Ctrl+C to stop.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

say()  { printf "\033[36m[listen]\033[0m %s\n" "$*"; }
die()  { printf "\033[31m[listen]\033[0m %s\n" "$*" >&2; exit 1; }

ROLE_FILE="$ROOT/.axl/role"
[[ -f "$ROLE_FILE" ]] || die "Run 'npm run axl:setup' first (.axl/role missing)."
ROLE=$(cat "$ROLE_FILE")

PEERS="$ROOT/axl/peers.json"
API_PORT=$(jq -r ".\"$ROLE\".apiPort" "$PEERS")

say "Listening as '$ROLE' on http://127.0.0.1:${API_PORT}/recv (Ctrl+C to stop)"
echo ""

# Cleanup any temp files on exit.
trap 'rm -f /tmp/axl-listen-hdr.* /tmp/axl-listen-body.* 2>/dev/null; exit 0' INT TERM

while true; do
  HDR=$(mktemp /tmp/axl-listen-hdr.XXXXXX)
  BODY=$(mktemp /tmp/axl-listen-body.XXXXXX)

  HTTP=$(curl -sS --max-time 3 \
    -o "$BODY" -D "$HDR" \
    -w "%{http_code}" \
    "http://127.0.0.1:${API_PORT}/recv" 2>/dev/null || echo "000")

  if [[ "$HTTP" == "200" ]] && [[ -s "$BODY" ]]; then
    # Pull X-From-Peer-Id header (case-insensitive grep, strip CR + whitespace).
    FROM_HEADER=$(grep -i '^x-from-peer-id:' "$HDR" | sed 's/^[Xx]-[Ff]rom-[Pp]eer-[Ii]d:[[:space:]]*//' | tr -d '\r\n[:space:]')

    # Resolve to a role via the TS helper. Falls back to "unknown" if no match.
    SENDER=$(echo "$FROM_HEADER" | npx --no-install tsx scripts/resolve-peer.ts 2>/dev/null || echo "unknown")

    # Try to parse JSON {from, msg, ts}. If it doesn't look like our shape, print raw.
    BODY_TEXT=$(cat "$BODY")
    PARSED_MSG=$(echo "$BODY_TEXT" | jq -r '.msg // empty' 2>/dev/null || echo "")
    PARSED_TS=$(echo  "$BODY_TEXT" | jq -r '.ts  // empty' 2>/dev/null || echo "")
    PARSED_FROM=$(echo "$BODY_TEXT" | jq -r '.from // empty' 2>/dev/null || echo "")

    TS_DISPLAY="${PARSED_TS:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

    if [[ -n "$PARSED_MSG" ]]; then
      # Trust .from for the label; verify against header-derived sender.
      LABEL="${PARSED_FROM:-$SENDER}"
      if [[ -n "$PARSED_FROM" && "$PARSED_FROM" != "$SENDER" && "$SENDER" != "unknown" ]]; then
        LABEL="${PARSED_FROM} (header says: $SENDER)"
      fi
      printf "\033[2m%s\033[0m \033[1;33m[%s]\033[0m %s\n" "$TS_DISPLAY" "$LABEL" "$PARSED_MSG"
    else
      # Non-conforming payload — show raw with header-derived sender.
      printf "\033[2m%s\033[0m \033[1;35m[%s/raw]\033[0m %s\n" "$TS_DISPLAY" "$SENDER" "$BODY_TEXT"
    fi
  fi

  rm -f "$HDR" "$BODY"
  sleep 1
done

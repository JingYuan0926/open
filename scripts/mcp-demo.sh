#!/usr/bin/env bash
# scripts/mcp-demo.sh — convenience wrappers for the 4 Phase 2 MCP demo calls.
#
# Usage:
#   bash scripts/mcp-demo.sh <step>
# where step is one of:
#   open    — opens AWS launch wizard in user's default browser
#   launch  — launches an EC2 t2.micro on user's AWS account
#   show    — opens the new instance's detail page (needs INSTANCE_ID env)
#   install — SSHes into the instance and runs the nanoclaw install command
#             (needs INSTANCE_ID and INSTANCE_IP env)
#
# Each step issues one MCP call to the user role's aws service. The user's Mac
# shows an approve y/n prompt before any action runs.

set -euo pipefail

cd "$(dirname "$0")/.."

TSX="$PWD/node_modules/.bin/tsx"
[[ -x "$TSX" ]] || { echo "node_modules/.bin/tsx missing — run 'npm install' first." >&2; exit 1; }

step="${1:-}"
case "$step" in
  open)
    "$TSX" scripts/mcp-call.ts user aws open_console
    ;;
  launch)
    NAME="${INSTANCE_NAME:-nanoclaw-demo}"
    "$TSX" scripts/mcp-call.ts user aws launch_instance "{\"name\":\"$NAME\"}"
    ;;
  show)
    : "${INSTANCE_ID:?Set INSTANCE_ID=i-... before running mcp:demo:show}"
    "$TSX" scripts/mcp-call.ts user aws show_in_console "{\"instance_id\":\"$INSTANCE_ID\"}"
    ;;
  install)
    : "${INSTANCE_ID:?Set INSTANCE_ID=i-... before running mcp:demo:install}"
    : "${INSTANCE_IP:?Set INSTANCE_IP=x.x.x.x before running mcp:demo:install}"
    "$TSX" scripts/mcp-call.ts user aws install_nanoclaw "{\"instance_id\":\"$INSTANCE_ID\",\"public_ip\":\"$INSTANCE_IP\"}"
    ;;
  *)
    cat >&2 <<EOF
Usage: bash scripts/mcp-demo.sh <step>

steps:
  open                                       open AWS launch wizard
  launch                                     launch EC2 (use INSTANCE_NAME=… to rename)
  show     INSTANCE_ID=i-…                   open instance detail page
  install  INSTANCE_ID=i-… INSTANCE_IP=x.x.x.x   ssh in and install nanoclaw
EOF
    exit 64
    ;;
esac

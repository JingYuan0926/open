#!/usr/bin/env bash
# scripts/mcp-demo.sh — convenience wrappers for the 3 Phase 2 MCP demo calls.
#
# Usage:
#   bash scripts/mcp-demo.sh <step>
# where step is one of:
#   signin     — opens AWS landing + sign-in pages in user's Chrome
#                (wraps `npm run demo:aws-1` over AXL)
#   provision  — provisions an EC2 t3.micro on user's AWS account
#                (wraps `npm run demo:aws-2` over AXL)
#   install    — deploys OpenClaw onto the provisioned EC2 box
#                (wraps `npm run demo:openclaw` over AXL)
#                Optional: PUBLIC_IP=x.x.x.x to override the state-file lookup
#
# Each step issues one MCP call to the user role's aws service. The user's Mac
# shows an approve y/n prompt before any action runs, then runs the demo
# script as a child process with stdout streamed to the user's terminal.

set -euo pipefail

cd "$(dirname "$0")/.."

TSX="$PWD/node_modules/.bin/tsx"
[[ -x "$TSX" ]] || { echo "node_modules/.bin/tsx missing — run 'npm install' first." >&2; exit 1; }

step="${1:-}"
case "$step" in
  signin)
    "$TSX" scripts/mcp-call.ts user aws aws_signin '{}'
    ;;
  provision)
    "$TSX" scripts/mcp-call.ts user aws provision_ec2 '{}'
    ;;
  install)
    if [[ -n "${PUBLIC_IP:-}" ]]; then
      "$TSX" scripts/mcp-call.ts user aws install_openclaw "{\"public_ip\":\"$PUBLIC_IP\"}"
    else
      "$TSX" scripts/mcp-call.ts user aws install_openclaw '{}'
    fi
    ;;
  *)
    cat >&2 <<EOF
Usage: bash scripts/mcp-demo.sh <step>

steps:
  signin                            open AWS sign-in pages on user's Mac
  provision                         launch EC2 + wait running + wait sshd
  install   [PUBLIC_IP=x.x.x.x]     SSH-install OpenClaw via Terminal.app
EOF
    exit 64
    ;;
esac

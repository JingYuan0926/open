#!/usr/bin/env bash
# scripts/setup-axl.sh — one-time AXL setup for a Mac in the 3-machine demo.
#
# Usage:
#   MACHINE_ROLE=<spectator|agent-b|agent-c> npm run axl:setup
#
# What it does:
#   1. Verifies macOS (Phase 1 is Mac-only).
#   2. Installs Homebrew, Go, and jq if missing.
#   3. Clones gensyn-ai/axl into .axl/ and builds the node binary.
#   4. Generates axl/private.pem (ed25519) if missing.
#   5. Reads axl/peers.json + MACHINE_ROLE, writes axl/node-config.json.
#   6. Persists MACHINE_ROLE to .axl/role so other scripts know who we are.
#
# Idempotent. Safe to re-run after editing peers.json.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

# ---------- helpers ----------
say()  { printf "\033[36m[setup]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[setup]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[31m[setup]\033[0m %s\n" "$*" >&2; exit 1; }

# ---------- 1. OS check ----------
if [[ "$(uname)" != "Darwin" ]]; then
  die "Phase 1 is macOS-only. Detected: $(uname). See axl/SETUP.md for other paths."
fi

# ---------- 2. MACHINE_ROLE check ----------
ROLE="${MACHINE_ROLE:-}"
if [[ -z "$ROLE" ]]; then
  die "Set MACHINE_ROLE env var. Example: MACHINE_ROLE=spectator npm run axl:setup"
fi
case "$ROLE" in
  spectator|agent-b|agent-c) ;;
  *) die "MACHINE_ROLE must be one of: spectator, agent-b, agent-c. Got: $ROLE" ;;
esac

# ---------- 3. peers.json check ----------
PEERS="$ROOT/axl/peers.json"
[[ -f "$PEERS" ]] || die "axl/peers.json missing. Pull the latest from git."

# ---------- 4. Homebrew ----------
if ! command -v brew >/dev/null 2>&1; then
  say "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # add brew to PATH for this shell (Apple Silicon vs Intel)
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

# ---------- 5. Go + jq + openssl ----------
for pkg in go jq openssl; do
  if ! command -v "$pkg" >/dev/null 2>&1; then
    say "Installing $pkg via brew..."
    brew install "$pkg"
  fi
done

# Go version sanity (AXL requires 1.25.5+)
GO_VER=$(go version | awk '{print $3}' | sed 's/go//')
GO_MAJOR=$(echo "$GO_VER" | cut -d. -f1)
GO_MINOR=$(echo "$GO_VER" | cut -d. -f2)
if [[ "$GO_MAJOR" -lt 1 ]] || { [[ "$GO_MAJOR" -eq 1 ]] && [[ "$GO_MINOR" -lt 25 ]]; }; then
  warn "Go $GO_VER detected; AXL needs 1.25+. Run: brew upgrade go"
fi

# ---------- 6. Clone + build AXL ----------
AXL_DIR="$ROOT/.axl"
if [[ ! -d "$AXL_DIR/.git" ]]; then
  say "Cloning gensyn-ai/axl into .axl/ ..."
  git clone --depth 1 https://github.com/gensyn-ai/axl.git "$AXL_DIR"
else
  say "Updating .axl/ ..."
  git -C "$AXL_DIR" pull --ff-only || warn "git pull failed; continuing with current checkout"
fi

if [[ ! -x "$AXL_DIR/node" ]] || [[ "$AXL_DIR/cmd/node" -nt "$AXL_DIR/node" ]]; then
  say "Building AXL node binary..."
  ( cd "$AXL_DIR" && go build -o node ./cmd/node/ )
fi
say "AXL binary ready: $AXL_DIR/node ($(du -h "$AXL_DIR/node" | awk '{print $1}'))"

# ---------- 7. ed25519 keypair ----------
KEY="$ROOT/axl/private.pem"
if [[ ! -f "$KEY" ]]; then
  say "Generating ed25519 keypair → axl/private.pem"
  openssl genpkey -algorithm ed25519 -out "$KEY"
  chmod 600 "$KEY"
else
  say "Reusing existing axl/private.pem"
fi

# ---------- 8. Write node-config.json from peers.json + MACHINE_ROLE ----------
SPECTATOR_IP=$(jq -r '.spectator.lanIp' "$PEERS")
SPECTATOR_LISTEN_PORT=7001
API_PORT=$(jq -r ".\"$ROLE\".apiPort" "$PEERS")

if [[ -z "$SPECTATOR_IP" || "$SPECTATOR_IP" == "null" ]]; then
  die "axl/peers.json is missing spectator.lanIp. Fill it in first."
fi

CONFIG="$ROOT/axl/node-config.json"
if [[ "$ROLE" == "spectator" ]]; then
  cat > "$CONFIG" <<EOF
{"PrivateKeyPath": "axl/private.pem", "Peers": [], "Listen": ["tls://0.0.0.0:${SPECTATOR_LISTEN_PORT}"], "api_port": ${API_PORT}}
EOF
else
  cat > "$CONFIG" <<EOF
{"PrivateKeyPath": "axl/private.pem", "Peers": ["tls://${SPECTATOR_IP}:${SPECTATOR_LISTEN_PORT}"], "Listen": [], "api_port": ${API_PORT}}
EOF
fi
say "Wrote $CONFIG (role=$ROLE)"

# ---------- 9. Persist MACHINE_ROLE for other scripts ----------
echo "$ROLE" > "$AXL_DIR/role"

# ---------- 10. Done ----------
cat <<EOF

\033[32m✓ Setup complete for role: $ROLE\033[0m

Next steps:
  1. \033[1mnpm run axl:start\033[0m         # starts the node, prints + saves your pubkey
  2. Paste your pubkey into Discord so the others can update peers.json
  3. Pull the updated peers.json once everyone's pubkey is in
  4. \033[1mnpm run axl:listen\033[0m        # in another terminal — see incoming messages
  $(if [[ "$ROLE" != "spectator" ]]; then printf "5. \033[1mnpm run axl:send <other-agent-role> \"hello\"\033[0m   # talk to the other agent\n"; fi)

EOF

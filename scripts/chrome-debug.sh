#!/usr/bin/env bash
# scripts/chrome-debug.sh — launch Chrome with --remote-debugging-port=9222
# and a dedicated user-data-dir, so demo:cdp can drive it via WebSocket.
#
# WSL: launches the Windows Chrome.exe (your existing Chrome won't be touched).
# macOS / Linux: launches local Chrome with a separate profile.
#
# The dedicated profile means you log into AWS *in this Chrome* once — the
# session persists in C:\temp\rh-demo-chrome (Win) or ~/.rh-demo-chrome (Unix).
# Doesn't conflict with your main Chrome.

set -euo pipefail

PORT=9222

# Detect host
if grep -qi microsoft /proc/version 2>/dev/null; then
  HOST="wsl"
elif [[ "$(uname)" == "Darwin" ]]; then
  HOST="mac"
else
  HOST="linux"
fi

CHROME_WIN="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
CHROME_WIN_X86="/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
CHROME_MAC="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

case "$HOST" in
  wsl)
    if [[ -x "$CHROME_WIN" ]]; then
      EXE="$CHROME_WIN"
    elif [[ -x "$CHROME_WIN_X86" ]]; then
      EXE="$CHROME_WIN_X86"
    else
      echo "Chrome not found at standard Windows paths." >&2
      exit 1
    fi
    DATA_DIR='C:\temp\rh-demo-chrome'
    echo "Launching Windows Chrome with debug port $PORT, profile: $DATA_DIR"
    "$EXE" --remote-debugging-port="$PORT" --user-data-dir="$DATA_DIR" &
    ;;
  mac)
    EXE="$CHROME_MAC"
    DATA_DIR="$HOME/.rh-demo-chrome"
    echo "Launching Chrome with debug port $PORT, profile: $DATA_DIR"
    "$EXE" --remote-debugging-port="$PORT" --user-data-dir="$DATA_DIR" &
    ;;
  linux)
    EXE=$(command -v google-chrome || command -v chromium || true)
    [[ -n "$EXE" ]] || { echo "google-chrome / chromium not found"; exit 1; }
    DATA_DIR="$HOME/.rh-demo-chrome"
    echo "Launching Chrome with debug port $PORT, profile: $DATA_DIR"
    "$EXE" --remote-debugging-port="$PORT" --user-data-dir="$DATA_DIR" &
    ;;
esac

# Give Chrome a moment to bind the port
sleep 2
echo ""
echo "✓ Chrome launched. Verify with: curl -s http://localhost:$PORT/json/version"
echo ""
echo "Next steps:"
echo "  1. In the new Chrome window, go to https://aws.amazon.com/ and sign in (one-time)"
echo "  2. Run: npm run demo:cdp"

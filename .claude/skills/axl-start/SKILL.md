---
name: axl-start
description: Start the local AXL node + A2A agent server (and on the user role, the MCP router + aws MCP server). Streams logs live until the user stops it.
disable-model-invocation: true
allowed-tools: Bash, Monitor
---

The user has invoked `/axl-start`. Run [scripts/axl-start.sh](scripts/axl-start.sh) and stream its output to them live. Do **not** wrap it in `npm run axl:start` — the npm wrapper prints two header lines (`> open@0.1.0 axl:start` / `> bash scripts/axl-start.sh`) the user explicitly does not want to see. Invoke the bash script directly so the script's own output is the first thing on screen.

## Steps

1. Start the script in the background:
   ```
   Bash: bash scripts/axl-start.sh
   run_in_background: true
   description: Start AXL node + A2A agent + MCP router
   ```
2. Use the **Monitor** tool to stream stdout/stderr to the user. Keep streaming until the user stops it (Ctrl+C in their terminal, or they tell you to stop) — this script runs forever by design (it's a daemon).
3. If the script exits within ~5 seconds of starting, that's an error. Show the user the captured output, stop monitoring, and surface the most likely fix:
   - `axl/peers.json missing` → `git pull` to sync.
   - `.axl/node binary missing` → run `MACHINE_ROLE=user npm run axl:setup` first.
   - `node_modules/.bin/tsx missing` → run `npm install`.
   - `ModuleNotFoundError: No module named 'aiohttp'` → re-run `MACHINE_ROLE=user npm run axl:setup` so the conda fallback in [scripts/setup-axl.sh](scripts/setup-axl.sh) kicks in.

## Notes

- The script suppresses orphaned processes from previous runs in its pre-flight; you don't need to clean up before invoking.
- It writes the local AXL pubkey into `axl/peers.json` once the node is healthy and copies it to the macOS clipboard (via `pbcopy`).
- When the user tells you to stop, just stop monitoring — the user will Ctrl+C the script in their own terminal. Don't `kill` the background process unless they ask, since the AXL node also stops the A2A server on shutdown via the script's `cleanup()` trap.

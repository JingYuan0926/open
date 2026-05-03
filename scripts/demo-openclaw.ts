// scripts/demo-openclaw.ts — Step 3 of the live demo: deploy OpenClaw onto
// the EC2 box that demo:aws-2 just provisioned.
//
// Two modes:
//   * Outer (default invocation): reads $TMPDIR/openclaw-demo-state.json,
//     spawns a NEW Terminal.app window that re-runs this script with
//     OPENCLAW_INNER=1 + the public IP.
//   * Inner (OPENCLAW_INNER=1): SSH into the EC2 box, install
//     git/nodejs/npm/pm2, clone github.com/derek2403/openclaw, paste local
//     .env, and start.sh under PM2 so the bot survives the SSH exit.
//
// Run on its own:
//   npm run demo:openclaw
//
// Optional:
//   PUBLIC_IP=1.2.3.4 npm run demo:openclaw   (skip the state-file lookup)

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_URL = "https://github.com/derek2403/openclaw.git";
const REPO_DIR = "openclaw";
const ENV_PATH = resolve(".env");
const KEY_PATH = resolve("axl/openclaw-demo-key.pem");
const STATE_PATH = join(tmpdir(), "openclaw-demo-state.json");
const MARKER_PATH = process.env.OPENCLAW_DEMO_MARKER ?? join(tmpdir(), "openclaw-demo-done.flag");

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function readState(): { publicIp: string; instanceId?: string; region?: string } | null {
  if (!existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function waitForEnterOrTimeout() {
  if (process.env.NO_WAIT === "1") return;
  if (process.stdin.isTTY) {
    process.stdout.write(`\n${yellow}Press Enter to close…${reset}`);
    await new Promise<void>((res) => {
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.once("data", () => {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        res();
      });
    });
    console.log("");
  } else {
    const secs = parseInt(process.env.CLOSE_SECS ?? "300", 10);
    console.log(`\n${dim}(window will close in ${secs}s — Ctrl+C to close sooner)${reset}`);
    await sleep(secs * 1000);
  }
}

// ──────────────────────────────────────────────────────────────────────
//  OUTER MODE: spawn Terminal.app
// ──────────────────────────────────────────────────────────────────────
function runOuter() {
  const argIp = process.argv[2];
  const envIp = process.env.PUBLIC_IP;
  const stateIp = readState()?.publicIp;
  const publicIp = argIp ?? envIp ?? stateIp;

  if (!publicIp) {
    console.error(`${red}error:${reset} no public IP found.`);
    console.error(`${dim}Tried CLI arg, $PUBLIC_IP, and ${STATE_PATH}.${reset}`);
    console.error(`${dim}Run \`npm run demo:aws-2\` first, or pass:${reset}`);
    console.error(`${yellow}    npm run demo:openclaw -- 1.2.3.4${reset}`);
    process.exit(1);
  }
  if (!existsSync(KEY_PATH)) {
    console.error(`${red}error:${reset} missing keypair PEM at ${KEY_PATH}`);
    console.error(`${dim}Run \`npm run demo:aws-2\` first to mint it.${reset}`);
    process.exit(1);
  }
  if (!existsSync(ENV_PATH)) {
    console.error(`${red}error:${reset} missing .env at ${ENV_PATH}`);
    console.error(`${dim}Create it with BOT_TOKEN + 0G_PRIVATE_KEY first.${reset}`);
    process.exit(1);
  }

  console.log(`${cyan}━━ demo:openclaw — outer ━━${reset}`);
  console.log(`${dim}target: ec2-user@${publicIp}${reset}`);
  console.log(`${dim}spawning Terminal.app for the SSH install…${reset}`);

  const cwd = process.cwd();
  const markerEnv = `OPENCLAW_DEMO_MARKER='${MARKER_PATH.replace(/'/g, "'\\''")}' `;
  const shellCmd =
    `cd '${cwd.replace(/'/g, "'\\''")}' && ` +
    `${markerEnv}OPENCLAW_INNER=1 npm run demo:openclaw -- ${publicIp}`;
  const escForApple = shellCmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  spawn(
    "osascript",
    [
      "-e", `tell application "Terminal" to do script "${escForApple}"`,
      "-e", `tell application "Terminal" to activate`,
    ],
    { detached: true, stdio: "ignore" },
  ).unref();

  console.log(`${green}✓ Terminal.app launched.${reset}`);
  console.log(`${dim}Watch the new window for the SSH session and PM2 startup.${reset}\n`);
}

// ──────────────────────────────────────────────────────────────────────
//  INNER MODE: actual SSH + install + PM2
// ──────────────────────────────────────────────────────────────────────
async function runInner() {
  const publicIp = process.argv[2];
  if (!publicIp) {
    console.error(`${red}usage:${reset} OPENCLAW_INNER=1 tsx scripts/demo-openclaw.ts <publicIp>`);
    process.exit(1);
  }
  if (!existsSync(KEY_PATH)) {
    console.error(`${red}missing keypair PEM at ${KEY_PATH}${reset}`);
    process.exit(1);
  }
  if (!existsSync(ENV_PATH)) {
    console.error(`${red}missing .env at ${ENV_PATH}${reset}`);
    process.exit(1);
  }

  console.log(`${cyan}╔══════════════════════════════════════════════════╗${reset}`);
  console.log(`${cyan}║${reset}    ${yellow}OPENCLAW DEPLOYMENT — Terminal 2${reset}              ${cyan}║${reset}`);
  console.log(`${cyan}╚══════════════════════════════════════════════════╝${reset}`);
  console.log(`${dim}target: ec2-user@${publicIp} · key: ${KEY_PATH}${reset}\n`);

  const envB64 = Buffer.from(readFileSync(ENV_PATH)).toString("base64");

  // The remote install script. PM2 wraps start.sh so the bot survives the
  // SSH exit (and `pm2 save` persists the process list across reboots once
  // `pm2 startup` is enabled — we skip that step to avoid a sudo prompt).
  const remoteScript = `set -e

# Welcome banner
cat /etc/motd 2>/dev/null
echo
echo "[$(date +%H:%M:%S)] connected to $(hostname)"

USER_NAME=$(whoami)
HOST_NAME=$(hostname -s)
say() {
  echo
  printf '[%s@%s ~]$ %s\\n' "$USER_NAME" "$HOST_NAME" "$1"
  sleep 0.4
}

say "sudo dnf install -y -q git nodejs npm"
sudo dnf install -y -q git nodejs npm 2>&1 | tail -3

say "sudo npm install -g pm2 --silent"
sudo npm install -g pm2 --silent 2>&1 | tail -3

say "git clone ${REPO_URL} ~/${REPO_DIR}"
rm -rf ~/${REPO_DIR}
git clone ${REPO_URL} ~/${REPO_DIR}
cd ~/${REPO_DIR}

say "# pasting .env from local Mac (base64-decoded silently for safety)"
echo '${envB64}' | base64 -d > .env
chmod 600 .env

say "ls -la .env"
ls -la .env

say "pm2 start ./start.sh --name openclaw --interpreter bash"
pm2 start ./start.sh --name openclaw --interpreter bash --cwd ~/${REPO_DIR} 2>&1 | tail -10

say "pm2 save"
pm2 save 2>&1 | tail -3

say "pm2 list"
pm2 list

echo
echo "✓ OpenClaw running under PM2 — survives SSH exit"
echo "  Reattach:  ssh -i <key> ec2-user@${publicIp}"
echo "  Logs:      pm2 logs openclaw"
echo "  Restart:   pm2 restart openclaw"
echo "  Stop:      pm2 stop openclaw"
echo
echo "(For boot-survival, run 'pm2 startup' on the box and follow its sudo prompt.)"
`;

  const sshArgs = [
    "-tt",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=15",
    "-i", KEY_PATH,
    `ec2-user@${publicIp}`,
    remoteScript,
  ];
  const r = spawnSync("ssh", sshArgs, { stdio: "inherit" });

  if (r.status !== 0) {
    console.log(`\n${red}ssh exited ${r.status}${reset}`);
  } else {
    console.log(`\n${green}━━ install complete ━━${reset}`);
  }

  // Drop the completion marker so the chat UI's /api/demo/status can flip to "done".
  try {
    writeFileSync(
      MARKER_PATH,
      JSON.stringify({ publicIp, at: new Date().toISOString() }),
    );
    console.log(`${dim}Marker written: ${MARKER_PATH}${reset}`);
  } catch (e) {
    console.log(`${dim}(could not write marker: ${e instanceof Error ? e.message : String(e)})${reset}`);
  }

  console.log(
    `\n${dim}Reconnect:${reset} ssh -i ${KEY_PATH} ec2-user@${publicIp}`,
  );

  await waitForEnterOrTimeout();
}

// ──────────────────────────────────────────────────────────────────────
//  ENTRY
// ──────────────────────────────────────────────────────────────────────
(async () => {
  if (process.env.OPENCLAW_INNER === "1") {
    await runInner();
  } else {
    runOuter();
  }
})().catch(async (err) => {
  console.error(`\n${red}error:${reset} ${err instanceof Error ? err.message : String(err)}`);
  if (process.env.OPENCLAW_INNER === "1" && process.env.NO_WAIT !== "1") {
    if (process.stdin.isTTY) {
      process.stdout.write(`${red}Error — press Enter to close…${reset}`);
      process.stdin.setRawMode?.(true);
      await new Promise<void>((res) => process.stdin.once("data", () => res()));
    } else {
      const secs = parseInt(process.env.CLOSE_SECS ?? "120", 10);
      console.error(`${red}(window will close in ${secs}s)${reset}`);
      await sleep(secs * 1000);
    }
  }
  process.exit(1);
});

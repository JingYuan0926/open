// scripts/demo-popup.ts — the "hacker movie" demo flow.
//
// Main terminal walks you through 4 AWS console pages. When it lands on the
// Instances list, it POPS OPEN a new Windows Terminal window where the
// AI execution (SDK launch + SSH install + terminate) runs live. The user
// sees both windows side-by-side: browser pages on Chrome, AI executing
// in a new terminal that opened itself.
//
// Run:
//   npm run demo:popup            (real AWS in the popup)
//   MOCK=1 npm run demo:popup     (popup runs in mock mode)
//   KEEP=1 npm run demo:popup     (popup leaves instance running)
//   DELAY_MS=8000 npm run demo:popup
//
// Requires Windows Terminal (wt.exe). Most Win10/11 installs have it.
// macOS support: TODO — would use osascript to spawn Terminal.app.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { openUrl } from "../axl/mcp-servers/aws-helpers/browser";

const URLS = {
  consoleHome: "https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1#",
  ec2Dashboard: "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Home:",
  launchWizard: "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#LaunchInstances:",
  instancesList: "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Instances:",
};

const BROWSER_DELAY = parseInt(process.env.DELAY_MS ?? "7000", 10);
const FIRST_PAGE_DELAY = BROWSER_DELAY + 2000;
const WSL_DISTRO = process.env.WSL_DISTRO_NAME ?? "Ubuntu";

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

function step(n: number, msg: string) {
  console.log(`\n${cyan}━━ step ${n}/5 ${reset}${yellow}${msg}${reset}`);
}
function ok(msg: string)   { console.log(`${green}  ✓${reset} ${msg}`); }
function info(msg: string) { console.log(`${dim}  ${msg}${reset}`); }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function findWtExe(): string | null {
  const candidates = [
    "/mnt/c/Users/User/AppData/Local/Microsoft/WindowsApps/wt.exe",
  ];
  // Glob /mnt/c/Users/*/AppData/Local/Microsoft/WindowsApps/wt.exe
  try {
    const homePath = process.env.USERPROFILE ?? "";
    if (homePath) {
      const wslHome = homePath.replace(/^([A-Z]):\\/i, "/mnt/$1/").replace(/\\/g, "/").toLowerCase();
      const guess = `${wslHome}/AppData/Local/Microsoft/WindowsApps/wt.exe`;
      if (existsSync(guess)) candidates.unshift(guess);
    }
  } catch { /* ignore */ }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function spawnPopup(): void {
  // Note: wt.exe treats `;` as its own command separator. We use `&&`
  // throughout the bash command instead, and `--` to mark end-of-wt-args.
  const envPrefix =
    `${process.env.MOCK ? "MOCK=1 " : ""}${process.env.KEEP ? "KEEP=1 " : ""}`;
  const bashCmd = `${envPrefix}npm run demo:cli-only && echo && echo "Press Enter to close" && read`;

  const wt = findWtExe();
  if (!wt) {
    info("wt.exe not found — falling back to cmd.exe new window (less pretty)");
    spawn("cmd.exe", [
      "/c", "start", "AI Execution",
      "wsl.exe", "-d", WSL_DISTRO, "--cd", process.cwd(),
      "bash", "-c", bashCmd,
    ], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn(wt, [
    "new-window",
    "--title", "AI Execution",
    "--",
    "wsl.exe", "-d", WSL_DISTRO, "--cd", process.cwd(),
    "bash", "-c", bashCmd,
  ], { detached: true, stdio: "ignore" }).unref();
}

(async () => {
  console.log(`${cyan}━━ demo:popup ━━${reset}`);
  console.log(`${dim}browser delay: ${BROWSER_DELAY}ms (first page +2s)${reset}`);
  console.log(`${dim}WSL distro for popup: ${WSL_DISTRO}${reset}`);

  // ─── 1. Console home (extra 2s, slowest first load)
  step(1, "browser → console home");
  await openUrl(URLS.consoleHome);
  ok("opened");
  await sleep(FIRST_PAGE_DELAY);

  // ─── 2. EC2 dashboard
  step(2, "browser → EC2 dashboard");
  await openUrl(URLS.ec2Dashboard);
  ok("opened");
  await sleep(BROWSER_DELAY);

  // ─── 3. Launch wizard
  step(3, "browser → launch wizard");
  await openUrl(URLS.launchWizard);
  ok("opened");
  await sleep(BROWSER_DELAY);

  // ─── 4. Instances list — landing point before AI takes over
  step(4, "browser → Instances list");
  await openUrl(URLS.instancesList);
  ok("opened");
  await sleep(BROWSER_DELAY);

  // ─── 5. POP a new terminal window for AI execution
  step(5, "🪟 spawning AI execution terminal");
  if (platform() !== "linux") {
    info(`(host OS '${platform()}' not WSL — would use osascript on macOS, not yet wired)`);
  } else {
    spawnPopup();
    ok("popup spawned — watch the new Windows Terminal window for SDK + SSH execution");
  }

  console.log(`\n${green}━━ main flow done — popup is doing the rest ━━${reset}`);
  console.log(`${dim}Tip: arrange Chrome and the popup terminal side-by-side for the demo.${reset}\n`);
})().catch(err => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

// scripts/demo-final.ts — full live demo: browser walk → popup terminal that
// runs the AWS CLI launch + SSH OpenClaw install.
//
// Composes the demo:after browser sequence (3 EC2 console pages) with a
// Terminal.app popup spawned via osascript. The popup runs demo:cli-aws,
// which uses the `aws` CLI directly (no @aws-sdk dep) plus system `ssh`.
//
// Run:
//   npm run demo:final              (real AWS, instance left running)
//   TERMINATE=1 npm run demo:final  (popup terminates the instance after install)
//   DELAY_MS=8000 npm run demo:final (slow the browser walk down)
//
// macOS only — uses osascript to drive Terminal.app.

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { openUrl } from "../axl/mcp-servers/aws-helpers/browser";

const URLS = {
  ec2Dashboard:  "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Home:",
  launchWizard:  "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#LaunchInstances:",
  instancesList: "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Instances:",
};

const DELAY_MS = parseInt(process.env.DELAY_MS ?? "7000", 10);

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

function step(n: number, total: number, msg: string) {
  console.log(`\n${cyan}━━ step ${n}/${total} ${reset}${yellow}${msg}${reset}`);
}
function ok(msg: string)   { console.log(`${green}  ✓${reset} ${msg}`); }
function info(msg: string) { console.log(`${dim}  ${msg}${reset}`); }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function spawnPopupMac(): void {
  const envPrefix =
    `${process.env.TERMINATE ? "TERMINATE=1 " : ""}` +
    `${process.env.AWS_REGION ? `AWS_REGION=${process.env.AWS_REGION} ` : ""}`;
  const cwd = process.cwd();
  const shellCmd = `cd '${cwd.replace(/'/g, "'\\''")}' && ${envPrefix}npm run demo:cli-aws`;
  const escForApple = shellCmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  spawn("osascript", [
    "-e", `tell application "Terminal" to do script "${escForApple}"`,
    "-e", `tell application "Terminal" to activate`,
  ], { detached: true, stdio: "ignore" }).unref();
}

(async () => {
  console.log(`${cyan}━━ demo:final — browser walk + AWS CLI execution ━━${reset}`);
  console.log(`${dim}delay: ${DELAY_MS}ms per page${reset}`);

  step(1, 4, "EC2 dashboard");
  await openUrl(URLS.ec2Dashboard);
  ok("opened");
  await sleep(DELAY_MS);

  step(2, 4, "Launch wizard");
  await openUrl(URLS.launchWizard);
  ok("opened");
  await sleep(DELAY_MS);

  step(3, 4, "Instances dashboard");
  await openUrl(URLS.instancesList);
  ok("opened");
  await sleep(DELAY_MS);

  step(4, 4, "spawning AI execution terminal (Terminal.app)");
  if (platform() !== "darwin") {
    info(`platform '${platform()}' isn't darwin — popup not spawned.`);
    info(`Run \`npm run demo:cli-aws\` manually in another terminal.`);
    process.exit(0);
  }
  spawnPopupMac();
  ok("Terminal.app launched — watch the new window for AWS CLI + SSH install");

  console.log(`\n${green}━━ main flow done — popup is doing the rest ━━${reset}`);
  console.log(`${dim}Tip: arrange Chrome and the popup terminal side-by-side for the demo.${reset}\n`);
})().catch(err => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

// scripts/demo-full.ts — end-to-end rehearsal: browser walk → SDK launch → browser refresh → SSH install → terminate.
//
// Skips the signup/sign-in URLs (assumes you're already logged into AWS in
// the default Chrome). Starts from the console home and walks: console
// home → EC2 dashboard → launch wizard, then transitions to SDK execution
// for the actual EC2 deploy.
//
// Run:
//   npm run demo:full              # full flow with terminate at the end
//   KEEP=1 npm run demo:full       # leave the instance running (skip terminate)
//   DELAY_MS=8000 npm run demo:full     # slower walk between browser steps
//   MOCK=1 npm run demo:full       # browser walk only, fake SDK output
//
// Same code path as the MCP demo; if this works on your machine, the
// AXL+MCP version on Macs is just transport on top.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { EC2Client, TerminateInstancesCommand } from "@aws-sdk/client-ec2";
import { openUrl } from "../axl/mcp-servers/aws-helpers/browser";
import {
  runInstance,
  AWS_REGION,
} from "../axl/mcp-servers/aws-helpers/ec2";
import { runRemote } from "../axl/mcp-servers/aws-helpers/ssh";

const KEY_PATH = resolve("axl/nanoclaw-key.pem");
const NANOCLAW_INSTALL_CMD =
  process.env.NANOCLAW_INSTALL_CMD ??
  `echo "nanoclaw installed: $(date)" > /tmp/nanoclaw.log && cat /tmp/nanoclaw.log && uname -a`;

const BROWSER_DELAY = parseInt(process.env.DELAY_MS ?? "5000", 10);
const KEEP = process.env.KEEP === "1";
const MOCK = process.env.MOCK === "1";

const URLS = {
  consoleHome: "https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1#",
  ec2Dashboard: "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1",
  launchWizard: "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#LaunchInstances:",
  instanceDetail: (id: string) =>
    `https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#InstanceDetails:instanceId=${id}`,
};

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

function step(n: number, total: number, msg: string) {
  console.log(`\n${cyan}━━ step ${n}/${total} ${reset}${yellow}${msg}${reset}`);
}
function ok(msg: string)   { console.log(`${green}  ✓${reset} ${msg}`); }
function fail(msg: string) { console.log(`${red}  ✗${reset} ${msg}`); }
function info(msg: string) { console.log(`${dim}  ${msg}${reset}`); }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const TOTAL = 7;

(async () => {
  console.log(`${cyan}━━ demo:full rehearsal ━━${reset}`);
  console.log(`${dim}browser delay between URL steps: ${BROWSER_DELAY}ms${reset}`);
  if (MOCK) console.log(`${dim}MOCK=1 — fake SDK + SSH (browser steps still real)${reset}`);
  if (KEEP) console.log(`${dim}KEEP=1 — instance will NOT be terminated at end${reset}`);

  // ─── 1. Browser: console home
  step(1, TOTAL, "browser → console home");
  await openUrl(URLS.consoleHome);
  ok("opened");
  await sleep(BROWSER_DELAY);

  // ─── 2. Browser: EC2 dashboard
  step(2, TOTAL, "browser → EC2 dashboard");
  await openUrl(URLS.ec2Dashboard);
  ok("opened");
  await sleep(BROWSER_DELAY);

  // ─── 3. Browser: launch wizard
  step(3, TOTAL, "browser → launch wizard");
  await openUrl(URLS.launchWizard);
  ok("opened");
  await sleep(BROWSER_DELAY);

  // ─── 4. SDK: RunInstances
  step(4, TOTAL, "SDK → RunInstances (replaces clicking through wizard)");
  let instanceId: string;
  let publicIp: string;
  if (MOCK) {
    await sleep(2000);
    instanceId = "i-mockedfake1234567";
    publicIp = "203.0.113.10";
    ok(`(mock) ${instanceId} at ${publicIp}`);
  } else {
    const t0 = Date.now();
    const launched = await runInstance("nanoclaw-demo");
    instanceId = launched.instance_id;
    publicIp = launched.public_ip;
    ok(`launched ${instanceId} at ${publicIp} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // ─── 5. Browser: instance detail with new ID
  step(5, TOTAL, "browser → instance detail page");
  await openUrl(URLS.instanceDetail(instanceId));
  ok(`opened ${URLS.instanceDetail(instanceId).slice(0, 90)}…`);
  await sleep(BROWSER_DELAY);

  // ─── 6. SSH: install nanoclaw
  step(6, TOTAL, "SSH → install nanoclaw on instance");
  if (MOCK) {
    await sleep(2000);
    ok(`(mock) ssh ec2-user@${publicIp} → install ok`);
  } else {
    if (!existsSync(KEY_PATH)) {
      fail(`missing ${KEY_PATH} — can't SSH`);
      process.exit(1);
    }
    info("waiting 20s for sshd to come up …");
    await sleep(20_000);
    const t0 = Date.now();
    const r = await runRemote({
      host: publicIp,
      keyPath: KEY_PATH,
      command: NANOCLAW_INSTALL_CMD,
    });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.code === 0) {
      ok(`install ok in ${dt}s`);
      info(`stdout:\n${r.stdout.split("\n").map(l => "    " + l).join("\n")}`);
    } else {
      fail(`install exit ${r.code} in ${dt}s`);
      info(`stderr: ${r.stderr}`);
    }
  }

  // ─── 7. Cleanup
  step(7, TOTAL, KEEP ? "skip terminate (KEEP=1)" : "terminate");
  if (KEEP || MOCK) {
    info(`Not terminating. Manual cleanup: npm run test:aws terminate ${instanceId}`);
  } else {
    const ec2 = new EC2Client({ region: AWS_REGION });
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
    ok(`terminate sent for ${instanceId}`);
  }

  console.log(`\n${green}━━ demo complete ━━${reset}\n`);
})().catch((err) => {
  console.error(`\n${red}error:${reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

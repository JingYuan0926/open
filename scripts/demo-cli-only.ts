// scripts/demo-cli-only.ts — the "AI execution" half of the demo.
//
// Runs in a popup Windows Terminal spawned by demo:popup. Does:
//   1. SDK: launch t2.micro on AWS
//   2. Browser: open the new instance's detail page in Chrome
//   3. SSH: install nanoclaw on the instance
//   4. SDK: terminate (unless KEEP=1)
//
// Run on its own:
//   npm run demo:cli-only         (real AWS)
//   MOCK=1 npm run demo:cli-only  (no real AWS — fake output)
//   KEEP=1 npm run demo:cli-only  (don't terminate at end)

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { EC2Client, TerminateInstancesCommand } from "@aws-sdk/client-ec2";
import { openUrl } from "../axl/mcp-servers/aws-helpers/browser";
import { runInstance, AWS_REGION } from "../axl/mcp-servers/aws-helpers/ec2";
import { runRemote } from "../axl/mcp-servers/aws-helpers/ssh";

const KEY_PATH = resolve("axl/nanoclaw-key.pem");
const NANOCLAW_INSTALL_CMD =
  process.env.NANOCLAW_INSTALL_CMD ??
  `echo "nanoclaw installed: $(date)" > /tmp/nanoclaw.log && cat /tmp/nanoclaw.log && uname -a`;
const KEEP = process.env.KEEP === "1";
const MOCK = process.env.MOCK === "1";

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

function step(n: number, msg: string) {
  console.log(`\n${cyan}━━ [${n}/4]${reset} ${yellow}${msg}${reset}`);
}
function ok(msg: string)   { console.log(`${green}  ✓${reset} ${msg}`); }
function fail(msg: string) { console.log(`${red}  ✗${reset} ${msg}`); }
function info(msg: string) { console.log(`${dim}  ${msg}${reset}`); }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log(`${cyan}╔══════════════════════════════════════╗${reset}`);
  console.log(`${cyan}║${reset}    ${yellow}AI EXECUTION TERMINAL${reset}             ${cyan}║${reset}`);
  console.log(`${cyan}║${reset}    operating on user's machine       ${cyan}║${reset}`);
  console.log(`${cyan}╚══════════════════════════════════════╝${reset}`);
  if (MOCK) console.log(`${dim}MOCK=1 — no real AWS calls${reset}`);

  // ─── 1. SDK launch
  step(1, "calling AWS RunInstances API…");
  let instanceId: string;
  let publicIp: string;
  if (MOCK) {
    await sleep(2500);
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

  // ─── 2. Browser: open instance detail
  step(2, "opening instance detail in Chrome");
  const detailUrl = `https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#InstanceDetails:instanceId=${instanceId}`;
  await openUrl(detailUrl);
  ok(detailUrl.slice(0, 90) + "…");
  await sleep(5000);

  // ─── 3. SSH install
  step(3, "SSH into instance and install nanoclaw");
  if (MOCK) {
    await sleep(2500);
    ok(`(mock) ssh ec2-user@${publicIp} → install ok`);
  } else {
    if (!existsSync(KEY_PATH)) {
      fail(`missing ${KEY_PATH} — can't SSH`);
      process.exit(1);
    }
    info("waiting 20s for sshd to come up…");
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
      info(`output:\n${r.stdout.split("\n").map(l => "    " + l).join("\n")}`);
    } else {
      fail(`install exit ${r.code} in ${dt}s`);
      info(`stderr: ${r.stderr}`);
    }
  }

  // ─── 4. Cleanup
  step(4, KEEP ? "skip terminate (KEEP=1)" : "terminate instance");
  if (KEEP || MOCK) {
    info(`Not terminating. Manual cleanup: npm run test:aws terminate ${instanceId}`);
  } else {
    const ec2 = new EC2Client({ region: AWS_REGION });
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
    ok(`terminate sent for ${instanceId}`);
  }

  console.log(`\n${green}━━ AI execution complete ━━${reset}\n`);
})().catch(err => {
  console.error(`\n${red}error:${reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

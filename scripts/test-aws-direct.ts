// scripts/test-aws-direct.ts — verify AWS SDK + SSH layer locally, no AXL, no MCP.
//
// Use this to debug the cloud side in isolation BEFORE running the full
// 3-Mac demo. If this script works end-to-end on your WSL/Mac, the AWS path
// is solid and any failure during the live demo is in AXL or routing.
//
// Usage:
//   npx tsx scripts/test-aws-direct.ts check                    # DescribeInstances (auth + connectivity)
//   npx tsx scripts/test-aws-direct.ts launch                   # real t2.micro launch (costs cents)
//   npx tsx scripts/test-aws-direct.ts install <id> <ip>        # SSH in and run nanoclaw install
//   npx tsx scripts/test-aws-direct.ts terminate <id>           # delete the instance (cleanup)
//   npx tsx scripts/test-aws-direct.ts full                     # launch → install → terminate, in order
//
// Prereqs (one-time):
//   1. ~/.aws/credentials with [default] aws_access_key_id + aws_secret_access_key
//   2. EC2 keypair "nanoclaw-key" exists in us-east-1 (AWS console → EC2 → Key Pairs)
//   3. .pem saved as axl/nanoclaw-key.pem  (chmod 600)

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  EC2Client,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { runInstance, waitForRunning, AWS_REGION, KEY_NAME } from "../axl/mcp-servers/aws-helpers/ec2";
import { runRemote } from "../axl/mcp-servers/aws-helpers/ssh";

const KEY_PATH = resolve("axl/nanoclaw-key.pem");
const NANOCLAW_INSTALL_CMD = process.env.NANOCLAW_INSTALL_CMD ??
  `echo "nanoclaw installed: $(date)" > /tmp/nanoclaw.log && cat /tmp/nanoclaw.log && uname -a`;

const dim = "\x1b[2m";
const cyan = "\x1b[36m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const yellow = "\x1b[1;33m";
const reset = "\x1b[0m";

function step(msg: string) { console.log(`\n${cyan}━━ ${msg} ━━${reset}`); }
function ok(msg: string)   { console.log(`${green}✓${reset} ${msg}`); }
function fail(msg: string) { console.log(`${red}✗${reset} ${msg}`); }
function info(msg: string) { console.log(`${dim}  ${msg}${reset}`); }

async function check(): Promise<void> {
  step("AWS SDK auth check");
  const client = new EC2Client({ region: AWS_REGION });
  try {
    const out = await client.send(new DescribeInstancesCommand({ MaxResults: 5 }));
    const count = out.Reservations?.flatMap(r => r.Instances ?? []).length ?? 0;
    ok(`DescribeInstances ok (region=${AWS_REGION}, found ${count} existing instance${count === 1 ? "" : "s"})`);
  } catch (err) {
    fail(`DescribeInstances failed: ${err instanceof Error ? err.message : String(err)}`);
    info("Likely cause: ~/.aws/credentials missing or wrong, or wrong region.");
    info("Fix: aws configure  (or paste credentials manually into ~/.aws/credentials)");
    process.exit(1);
  }

  step("EC2 keypair check");
  if (!existsSync(KEY_PATH)) {
    fail(`Missing ${KEY_PATH}`);
    info(`Create keypair "${KEY_NAME}" in AWS console → EC2 → Key Pairs (region=${AWS_REGION})`);
    info(`Download the .pem and save it to ${KEY_PATH}, then: chmod 600 ${KEY_PATH}`);
  } else {
    ok(`${KEY_PATH} exists`);
  }
}

async function launch(): Promise<{ id: string; ip: string }> {
  step("Launch t2.micro (real AWS call — costs cents)");
  const t0 = Date.now();
  const result = await runInstance("nanoclaw-test-direct");
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  ok(`launched ${result.instance_id} at ${result.public_ip} in ${dt}s`);
  return { id: result.instance_id, ip: result.public_ip };
}

async function install(instanceId: string, publicIp: string): Promise<void> {
  step(`SSH install on ${instanceId} (${publicIp})`);
  if (!existsSync(KEY_PATH)) {
    fail(`Missing ${KEY_PATH}`);
    process.exit(1);
  }
  const t0 = Date.now();
  const r = await runRemote({
    host: publicIp,
    keyPath: KEY_PATH,
    command: NANOCLAW_INSTALL_CMD,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.code === 0) {
    ok(`install exit 0 in ${dt}s`);
    info(`stdout:\n${r.stdout.split("\n").map(l => "    " + l).join("\n")}`);
  } else {
    fail(`install exit ${r.code} in ${dt}s`);
    info(`stderr: ${r.stderr}`);
    process.exit(1);
  }
}

async function terminate(instanceId: string): Promise<void> {
  step(`Terminate ${instanceId}`);
  const client = new EC2Client({ region: AWS_REGION });
  await client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
  ok(`terminate sent for ${instanceId} (state will transition shutting-down → terminated)`);
}

async function full(): Promise<void> {
  await check();
  const { id, ip } = await launch();

  // brief wait for sshd to come up (waitForRunning above only checks state=running)
  step("Wait 20s for sshd to be ready (instances boot before sshd accepts)");
  await new Promise(r => setTimeout(r, 20_000));
  ok("ready");

  try {
    await install(id, ip);
  } finally {
    // Always terminate to avoid leaking instances
    await terminate(id);
  }

  console.log(`\n${green}━━ all green ━━${reset} aws + ssh path verified end-to-end\n`);
}

const cmd = process.argv[2];
const args = process.argv.slice(3);

(async () => {
  switch (cmd) {
    case "check":
      await check();
      break;
    case "launch": {
      const { id, ip } = await launch();
      console.log(`\n${yellow}export INSTANCE_ID=${id}${reset}`);
      console.log(`${yellow}export INSTANCE_IP=${ip}${reset}`);
      console.log(`${dim}(remember to terminate when done: npx tsx ${process.argv[1]} terminate ${id})${reset}\n`);
      break;
    }
    case "install":
      if (args.length < 2) { console.error("usage: install <id> <ip>"); process.exit(64); }
      await install(args[0], args[1]);
      break;
    case "terminate":
      if (args.length < 1) { console.error("usage: terminate <id>"); process.exit(64); }
      await terminate(args[0]);
      break;
    case "full":
      await full();
      break;
    default:
      console.error(`Usage:
  npx tsx scripts/test-aws-direct.ts check
  npx tsx scripts/test-aws-direct.ts launch
  npx tsx scripts/test-aws-direct.ts install <id> <ip>
  npx tsx scripts/test-aws-direct.ts terminate <id>
  npx tsx scripts/test-aws-direct.ts full`);
      process.exit(64);
  }
})().catch(err => {
  console.error(`\n${red}error:${reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

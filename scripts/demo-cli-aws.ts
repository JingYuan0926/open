// scripts/demo-cli-aws.ts — AWS CLI version of "AI executes on user's Mac".
//
// Designed to run inside the popup Terminal.app window spawned by demo:final.
// Uses the `aws` CLI and the system `ssh` — no @aws-sdk, no ssh2.
//
// Steps:
//   1. aws sts get-caller-identity        — confirm credentials
//   2. ensure SSH keypair                  — create + persist if missing
//   3. ensure security group + SSH ingress — idempotent
//   4. aws ec2 run-instances              — launch t3.micro
//   5. aws ec2 wait instance-running      — block on running state
//   6. wait for sshd                      — ~30s for first boot
//   7. ssh in → git clone → run setup     — placeholders, edit below
//
// Run on its own:
//   npm run demo:cli-aws                  (real AWS, leaves instance running)
//   TERMINATE=1 npm run demo:cli-aws      (terminate after install)
//
// Env:
//   AWS_REGION=us-east-1                  (default; override if needed)

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ──────────────────────────────────────────────────────────────────
//  PLACEHOLDERS — replace these with the real repo and setup command
//  before running the live demo.
// ──────────────────────────────────────────────────────────────────
const REPO_URL = "https://github.com/derek2403/openclaw.git";
const REPO_DIR = "openclaw";          // dir name under ~ to clone into
const SETUP_CMD = "bash start.sh";    // runs inside the cloned repo dir
const ENV_PATH = resolve(".env");     // local .env to upload as ~/openclaw/.env on EC2

// ──────────────────────────────────────────────────────────────────
const REGION = process.env.AWS_REGION ?? "us-east-1";
const KEY_NAME = "openclaw-demo-key";
const KEY_PATH = resolve("axl/openclaw-demo-key.pem");
const SG_NAME = "openclaw-demo-sg";
const INSTANCE_TYPE = "t3.micro";
const NAME_TAG = "openclaw-demo";
const SSM_AMI_PARAM = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64";

const TERMINATE = process.env.TERMINATE === "1";

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

const TOTAL = 7;
function step(n: number, msg: string) { console.log(`\n${cyan}━━ [${n}/${TOTAL}]${reset} ${yellow}${msg}${reset}`); }
function ok(msg: string)   { console.log(`${green}  ✓${reset} ${msg}`); }
function fail(msg: string) { console.log(`${red}  ✗${reset} ${msg}`); }
function info(msg: string) { console.log(`${dim}  ${msg}${reset}`); }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function aws(args: string): string {
  return execSync(`aws ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function awsMaybe(args: string): string | null {
  const r = spawnSync("bash", ["-c", `aws ${args} 2>/dev/null`], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const out = (r.stdout ?? "").trim();
  return out === "" || out === "None" ? null : out;
}
function awsSilent(args: string): void {
  spawnSync("bash", ["-c", `aws ${args} >/dev/null 2>&1`], { stdio: "ignore" });
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
    const secs = parseInt(process.env.CLOSE_SECS ?? "120", 10);
    console.log(`\n${dim}(window will close in ${secs}s — Ctrl+C to close sooner)${reset}`);
    await sleep(secs * 1000);
  }
}

(async () => {
  console.log(`${cyan}╔══════════════════════════════════════╗${reset}`);
  console.log(`${cyan}║${reset}    ${yellow}AI EXECUTION TERMINAL${reset}             ${cyan}║${reset}`);
  console.log(`${cyan}║${reset}    aws cli · live on user's Mac      ${cyan}║${reset}`);
  console.log(`${cyan}╚══════════════════════════════════════╝${reset}`);
  console.log(`${dim}region: ${REGION} · type: ${INSTANCE_TYPE} · key: ${KEY_NAME}${reset}`);
  console.log(`${dim}repo:   ${REPO_URL}${reset}`);
  console.log(`${dim}setup:  ${SETUP_CMD}${reset}`);
  console.log(`${dim}env:    ${ENV_PATH}${reset}`);

  // 0. preflight — fail fast if .env is missing, before we provision anything
  if (!existsSync(ENV_PATH)) {
    fail(`.env not found at ${ENV_PATH}`);
    info(`Create it with the openclaw secrets (bot token, 0G key) before running.`);
    process.exit(1);
  }

  // 1. identity
  step(1, "aws sts get-caller-identity");
  const arn = aws(`sts get-caller-identity --query Arn --output text`);
  ok(arn);

  // 2. keypair
  step(2, `ensure keypair '${KEY_NAME}'`);
  const inAws = awsMaybe(`ec2 describe-key-pairs --key-names ${KEY_NAME} --region ${REGION} --query 'KeyPairs[0].KeyName' --output text`);
  if (inAws && existsSync(KEY_PATH)) {
    ok(`exists in AWS and at ${KEY_PATH}`);
  } else if (inAws && !existsSync(KEY_PATH)) {
    fail(`'${KEY_NAME}' exists in AWS but PEM is missing locally at ${KEY_PATH}`);
    info(`recreate: aws ec2 delete-key-pair --key-name ${KEY_NAME} --region ${REGION}`);
    info(`then re-run this script to mint a new keypair.`);
    process.exit(1);
  } else {
    info("creating keypair in AWS…");
    const pem = aws(`ec2 create-key-pair --key-name ${KEY_NAME} --region ${REGION} --query KeyMaterial --output text`);
    mkdirSync(dirname(KEY_PATH), { recursive: true });
    writeFileSync(KEY_PATH, pem + (pem.endsWith("\n") ? "" : "\n"));
    chmodSync(KEY_PATH, 0o600);
    ok(`created · saved to ${KEY_PATH} (chmod 600)`);
  }

  // 3. security group + SSH inbound
  step(3, `ensure security group '${SG_NAME}' (SSH 22 from anywhere)`);
  let sgId: string;
  const existing = awsMaybe(`ec2 describe-security-groups --filters Name=group-name,Values=${SG_NAME} --region ${REGION} --query 'SecurityGroups[0].GroupId' --output text`);
  if (existing) {
    sgId = existing;
    info(`using existing ${sgId}`);
  } else {
    sgId = aws(`ec2 create-security-group --group-name ${SG_NAME} --description "OpenClaw demo SSH" --region ${REGION} --query GroupId --output text`);
    info(`created ${sgId}`);
  }
  awsSilent(`ec2 authorize-security-group-ingress --group-id ${sgId} --protocol tcp --port 22 --cidr 0.0.0.0/0 --region ${REGION}`);
  ok(`${sgId} ready`);

  // 4. resolve AMI + run-instances
  step(4, `aws ec2 run-instances ${INSTANCE_TYPE}`);
  info(`resolving latest Amazon Linux 2023 AMI via SSM…`);
  const amiId = aws(`ssm get-parameter --name ${SSM_AMI_PARAM} --region ${REGION} --query Parameter.Value --output text`);
  info(`AMI: ${amiId}`);
  const instanceId = aws([
    `ec2 run-instances`,
    `--image-id ${amiId}`,
    `--instance-type ${INSTANCE_TYPE}`,
    `--key-name ${KEY_NAME}`,
    `--security-group-ids ${sgId}`,
    `--region ${REGION}`,
    `--tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=${NAME_TAG}}]'`,
    `--query 'Instances[0].InstanceId'`,
    `--output text`,
  ].join(" "));
  ok(`launched ${instanceId}`);

  // 5. wait running
  step(5, `aws ec2 wait instance-running ${instanceId}`);
  aws(`ec2 wait instance-running --instance-ids ${instanceId} --region ${REGION}`);
  const publicIp = aws(`ec2 describe-instances --instance-ids ${instanceId} --region ${REGION} --query 'Reservations[0].Instances[0].PublicIpAddress' --output text`);
  ok(`running at ${publicIp}`);

  // 6. wait sshd
  step(6, "waiting for sshd to come up (~30s)");
  await sleep(30_000);
  ok(`sshd should be reachable`);

  // 7. interactive ssh — show AL2023 banner, fake prompts, then clone + run
  step(7, `ssh ec2-user@${publicIp} → live install in popup terminal`);
  const envB64 = Buffer.from(readFileSync(ENV_PATH)).toString("base64");
  const remoteScript = `set -e

# Amazon Linux 2023 welcome banner
cat /etc/motd 2>/dev/null
echo
echo "Connected to $(hostname) ($(hostname -I 2>/dev/null | awk '{print $1}'))"
echo
sleep 1

USER_NAME=$(whoami)
HOST_NAME=$(hostname -s)

# Fake an interactive prompt before each command so the audience sees what's
# being run on the EC2 box.
say() {
  echo
  printf '[%s@%s ~]$ %s\\n' "$USER_NAME" "$HOST_NAME" "$1"
  sleep 0.5
}

say "sudo dnf install -y git nodejs npm"
sudo dnf install -y -q git nodejs npm 2>&1 | tail -5

say "git clone ${REPO_URL} ~/${REPO_DIR}"
rm -rf ~/${REPO_DIR}
git clone ${REPO_URL} ~/${REPO_DIR}
cd ~/${REPO_DIR}

say "# loading .env from your Mac"
echo '${envB64}' | base64 -d > .env
chmod 600 .env

say "ls -la"
ls -la

say "${SETUP_CMD}"
${SETUP_CMD}
`;

  const scriptB64 = Buffer.from(remoteScript).toString("base64");
  const sshArgs = [
    "-tt",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=15",
    "-i", KEY_PATH,
    `ec2-user@${publicIp}`,
    `printf '%s' '${scriptB64}' | base64 -d | bash`,
  ];
  const r = spawnSync("ssh", sshArgs, { stdio: "inherit" });
  if (r.status !== 0) {
    fail(`ssh exited ${r.status}`);
  } else {
    ok(`setup complete on ${publicIp}`);
  }

  // handoff
  console.log(`\n${green}━━ handoff to user ━━${reset}`);
  info(`Instance ID: ${instanceId}`);
  info(`Public IP:   ${publicIp}`);
  info(`SSH:         ssh -i ${KEY_PATH} ec2-user@${publicIp}`);
  info(`Region:      ${REGION}`);

  // Drop a marker so the chat UI's /api/demo/status can know we're done.
  const markerPath = process.env.OPENCLAW_DEMO_MARKER ?? `${process.env.TMPDIR ?? "/tmp"}/openclaw-demo-done.flag`;
  try {
    writeFileSync(markerPath, JSON.stringify({ instanceId, publicIp, region: REGION, at: new Date().toISOString() }));
    info(`Marker written: ${markerPath}`);
  } catch (e) {
    info(`(could not write marker: ${e instanceof Error ? e.message : String(e)})`);
  }

  if (TERMINATE) {
    aws(`ec2 terminate-instances --instance-ids ${instanceId} --region ${REGION}`);
    ok(`terminate sent for ${instanceId}`);
  } else {
    info(`Instance left running. Manual cleanup:`);
    info(`  aws ec2 terminate-instances --instance-ids ${instanceId} --region ${REGION}`);
  }

  await waitForEnterOrTimeout();
})().catch(async (err) => {
  console.error(`\n${red}error:${reset} ${err instanceof Error ? err.message : String(err)}`);
  if (process.env.NO_WAIT !== "1") {
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

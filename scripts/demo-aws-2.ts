// scripts/demo-aws-2.ts — Step 2 of the live demo: provision EC2.
//
// Walks through the AWS CLI to launch a t3.micro EC2 instance:
//   1. aws sts get-caller-identity        — confirm credentials
//   2. ensure SSH keypair                  — create + persist if missing
//   3. ensure security group + SSH ingress — idempotent
//   4. resolve AMI + run-instances        — launch t3.micro
//   5. wait running                        — block on running state
//   6. wait sshd                           — ~30s for first boot
//
// On success, writes { instanceId, publicIp, region } to
//   $TMPDIR/openclaw-demo-state.json
// so demo:openclaw can pick up the public IP without an extra arg.
//
// Then it stops. To deploy OpenClaw onto the box, run:
//   npm run demo:openclaw
//
// Env:
//   AWS_REGION=us-east-1                  (default; override if needed)

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { openUrl } from "../axl/mcp-servers/aws-helpers/browser";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const KEY_NAME = "openclaw-demo-key";
const KEY_PATH = resolve("axl/openclaw-demo-key.pem");
const SG_NAME = "openclaw-demo-sg";
const INSTANCE_TYPE = "t3.micro";
const NAME_TAG = "openclaw-demo";
const SSM_AMI_PARAM = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64";
const STATE_PATH = join(tmpdir(), "openclaw-demo-state.json");

// Visible "AI walks the AWS console" tabs we open in the user's browser
// while the CLI does the actual provisioning underneath. Audience sees
// Home → LaunchInstances → Instances; by the time we hit Instances, the
// new t3.micro is already running and a refresh shows it live.
const CONSOLE_URLS = {
  home: `https://us-east-1.console.aws.amazon.com/ec2/home?region=${REGION}#Home:`,
  launch: `https://us-east-1.console.aws.amazon.com/ec2/home?region=${REGION}#LaunchInstances:`,
  instances: `https://us-east-1.console.aws.amazon.com/ec2/home?region=${REGION}#Instances:`,
} as const;

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

const TOTAL = 6;
function step(n: number, msg: string) { console.log(`\n${cyan}━━ [${n}/${TOTAL}]${reset} ${yellow}${msg}${reset}`); }
function ok(msg: string)   { console.log(`${green}  ✓${reset} ${msg}`); }
function fail(msg: string) { console.log(`${red}  ✗${reset} ${msg}`); }
function info(msg: string) { console.log(`${dim}  ${msg}${reset}`); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

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

(async () => {
  console.log(`${cyan}━━ demo:aws-2 — provision EC2 ━━${reset}`);
  console.log(`${dim}region: ${REGION} · type: ${INSTANCE_TYPE} · key: ${KEY_NAME}${reset}`);

  // 0. always-fresh: terminate any prior demo instance + clear state, so
  //    each provision lands on a brand-new box and `install_openclaw`
  //    targets the newest one. Best-effort — if the prior instance is
  //    already gone, just continue.
  if (existsSync(STATE_PATH)) {
    try {
      const prior = JSON.parse(readFileSync(STATE_PATH, "utf8")) as { instanceId?: string; region?: string };
      if (prior.instanceId) {
        const priorRegion = prior.region ?? REGION;
        info(`previous demo instance ${prior.instanceId} found — terminating before fresh provision…`);
        awsSilent(`ec2 terminate-instances --instance-ids ${prior.instanceId} --region ${priorRegion}`);
        ok(`requested terminate on ${prior.instanceId}`);
      }
    } catch {
      // stale / malformed — fall through to delete
    }
    try { unlinkSync(STATE_PATH); } catch { /* already gone */ }
  }

  // 1. identity
  step(1, "verifying AWS credentials with sts get-caller-identity");
  const arn = aws(`sts get-caller-identity --query Arn --output text`);
  ok(`identity confirmed: ${arn}`);

  // visible: open EC2 dashboard so the audience sees us "land" in the console
  info("opening EC2 console dashboard in browser");
  await openUrl(CONSOLE_URLS.home);

  // 2. keypair
  step(2, `preparing SSH keypair '${KEY_NAME}' for the new instance`);
  const inAws = awsMaybe(
    `ec2 describe-key-pairs --key-names ${KEY_NAME} --region ${REGION} --query 'KeyPairs[0].KeyName' --output text`,
  );
  if (inAws && existsSync(KEY_PATH)) {
    ok(`exists in AWS and at ${KEY_PATH}`);
  } else if (inAws && !existsSync(KEY_PATH)) {
    fail(`'${KEY_NAME}' exists in AWS but PEM is missing locally at ${KEY_PATH}`);
    info(`recreate: aws ec2 delete-key-pair --key-name ${KEY_NAME} --region ${REGION}`);
    info(`then re-run this script.`);
    process.exit(1);
  } else {
    info("creating keypair in AWS…");
    const pem = aws(
      `ec2 create-key-pair --key-name ${KEY_NAME} --region ${REGION} --query KeyMaterial --output text`,
    );
    mkdirSync(dirname(KEY_PATH), { recursive: true });
    writeFileSync(KEY_PATH, pem + (pem.endsWith("\n") ? "" : "\n"));
    chmodSync(KEY_PATH, 0o600);
    ok(`created · saved to ${KEY_PATH} (chmod 600)`);
  }

  // 3. security group
  step(3, `configuring security group '${SG_NAME}' to allow SSH on port 22`);
  let sgId: string;
  const existingSg = awsMaybe(
    `ec2 describe-security-groups --filters Name=group-name,Values=${SG_NAME} --region ${REGION} --query 'SecurityGroups[0].GroupId' --output text`,
  );
  if (existingSg) {
    sgId = existingSg;
    info(`using existing ${sgId}`);
  } else {
    sgId = aws(
      `ec2 create-security-group --group-name ${SG_NAME} --description "OpenClaw demo SSH" --region ${REGION} --query GroupId --output text`,
    );
    info(`created ${sgId}`);
  }
  awsSilent(
    `ec2 authorize-security-group-ingress --group-id ${sgId} --protocol tcp --port 22 --cidr 0.0.0.0/0 --region ${REGION}`,
  );
  ok(`${sgId} ready`);

  // 4. AMI + run-instances
  step(4, `launching ${INSTANCE_TYPE} EC2 instance with Amazon Linux 2023`);
  info(`resolving latest Amazon Linux 2023 AMI via SSM`);
  const amiId = aws(
    `ssm get-parameter --name ${SSM_AMI_PARAM} --region ${REGION} --query Parameter.Value --output text`,
  );
  info(`using AMI ${amiId}`);
  const instanceId = aws(
    [
      `ec2 run-instances`,
      `--image-id ${amiId}`,
      `--instance-type ${INSTANCE_TYPE}`,
      `--key-name ${KEY_NAME}`,
      `--security-group-ids ${sgId}`,
      `--region ${REGION}`,
      `--tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=${NAME_TAG}}]'`,
      `--query 'Instances[0].InstanceId'`,
      `--output text`,
    ].join(" "),
  );
  ok(`launched instance ${instanceId}`);

  // visible: open Launch-Instances console page so audience sees the wizard
  info("opening Launch Instances page in browser");
  await openUrl(CONSOLE_URLS.launch);

  // 5. wait running + grab IP
  step(5, `waiting for instance ${instanceId} to enter 'running' state`);
  aws(`ec2 wait instance-running --instance-ids ${instanceId} --region ${REGION}`);
  const publicIp = aws(
    `ec2 describe-instances --instance-ids ${instanceId} --region ${REGION} --query 'Reservations[0].Instances[0].PublicIpAddress' --output text`,
  );
  ok(`instance is up at ${publicIp}`);

  // visible: open Instances list — by now the new t3.micro shows up after a refresh
  info("opening EC2 Instances page in browser — refresh to see the new instance");
  await openUrl(CONSOLE_URLS.instances);

  // 6. wait sshd
  step(6, "giving sshd 30 seconds to start accepting SSH connections");
  await sleep(30_000);
  ok(`sshd should be reachable on ${publicIp}:22`);

  // Persist state for demo:openclaw to consume.
  writeFileSync(
    STATE_PATH,
    JSON.stringify({ instanceId, publicIp, region: REGION, keyPath: KEY_PATH, at: new Date().toISOString() }, null, 2),
  );

  console.log(`\n${green}━━ EC2 provisioned ━━${reset}`);
  info(`Instance ID: ${instanceId}`);
  info(`Public IP:   ${publicIp}`);
  info(`Region:      ${REGION}`);
  info(`SSH:         ssh -i ${KEY_PATH} ec2-user@${publicIp}`);
  info(`State saved: ${STATE_PATH}`);
  console.log(`\n${dim}Next:${reset} ${yellow}npm run demo:openclaw${reset}`);
  console.log(`${dim}Cleanup later:${reset} aws ec2 terminate-instances --instance-ids ${instanceId} --region ${REGION}\n`);
})().catch((err) => {
  console.error(`\n${red}error:${reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

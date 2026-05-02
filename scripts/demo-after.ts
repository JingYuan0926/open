// scripts/demo-after.ts — post-login portion of the demo (simple URL opens).
//
// Assumes you're already signed in to AWS in your default Chrome.
// Opens 3 console pages in sequence.
//
// Flow:
//   1. Console home          [auto, 7s]
//   2. EC2 dashboard         [auto, 7s]
//   3. Launch wizard         [done — SDK takes over from here]
//
// Then run: npm run test:aws launch    (or npm run demo:cli-only)

import { openUrl } from "../axl/mcp-servers/aws-helpers/browser";

const DELAY_MS = parseInt(process.env.DELAY_MS ?? "7000", 10);

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

function step(n: number, total: number, msg: string) { console.log(`\n${cyan}━━ step ${n}/${total} ${reset}${yellow}${msg}${reset}`); }
function ok(msg: string)   { console.log(`${green}  ✓${reset} ${msg}`); }
function info(msg: string) { console.log(`${dim}  ${msg}${reset}`); }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log(`${cyan}━━ demo:after — post-login flow ━━${reset}`);

  step(1, 3, "Console home");
  await openUrl("https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1#");
  ok("opened");
  await sleep(DELAY_MS);

  step(2, 3, "EC2 dashboard");
  await openUrl("https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Home:");
  ok("opened");
  await sleep(DELAY_MS);

  step(3, 3, "Launch wizard");
  await openUrl("https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#LaunchInstances:");
  ok("opened — ready for SDK takeover");

  console.log(`\n${green}━━ post-login done ━━${reset}`);
  info("Next: SDK does the actual EC2 launch + SSH install. Run:");
  info("  npm run test:aws launch       (then test:aws install <id> <ip>)");
  info("  or: npm run demo:cli-only     (full launch + install + terminate)");
})().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

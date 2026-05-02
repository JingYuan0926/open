// scripts/demo-after.ts — post-login portion of the demo.
//
// Assumes you're already signed in to AWS in the debug Chrome (run
// 'npm run demo:before' first, sign in there).
//
// AI: navigate console → EC2 dashboard → launch wizard.
// Then SDK takes over — the actual EC2 launch is via 'npm run test:aws launch'.
//
// Run: npm run demo:after

import { CDPSession } from "./cdp-helper";

const DELAY_MS = parseInt(process.env.DELAY_MS ?? "5000", 10);

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

function step(n: number, total: number, msg: string) { console.log(`\n${cyan}━━ step ${n}/${total} ${reset}${yellow}${msg}${reset}`); }
function ok(msg: string)   { console.log(`${green}  ✓${reset} ${msg}`); }
function info(msg: string) { console.log(`${dim}  ${msg}${reset}`); }

const TOTAL = 3;

(async () => {
  console.log(`${cyan}━━ demo:after — post-login flow ━━${reset}`);
  info("connecting to debug Chrome at localhost:9222 …");

  let cdp: CDPSession;
  try {
    cdp = await CDPSession.connect(9222);
    ok("connected");
  } catch (err) {
    console.log(`${red}  ✗${reset} couldn't connect: ${err instanceof Error ? err.message : String(err)}`);
    info("Run 'npm run chrome:debug' first.");
    process.exit(1);
  }

  // Sanity: warn if user isn't signed in
  const url = await cdp.getCurrentUrl();
  if (url.includes("signin.aws.amazon.com")) {
    console.log(`${red}  ✗${reset} you're still on the sign-in page. Run 'npm run demo:before' first and sign in.`);
    process.exit(1);
  }

  step(1, TOTAL, "AI: navigate to console home");
  await cdp.navigate("https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1#", DELAY_MS);
  ok("on console home");

  step(2, TOTAL, "AI: navigate to EC2 dashboard");
  await cdp.navigate("https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Home:", DELAY_MS);
  ok("on EC2 dashboard");

  step(3, TOTAL, "AI: navigate to launch wizard");
  await cdp.navigate("https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#LaunchInstances:", DELAY_MS);
  ok("on launch wizard — ready for SDK takeover");

  console.log(`\n${green}━━ post-login done ━━${reset}`);
  info("Next: SDK does the actual EC2 launch + SSH install. Run:");
  info("  npm run test:aws launch       (then test:aws install <id> <ip>)");
  info("  or: npm run demo:cli-only     (full launch + install + terminate)");
  cdp.close();
})().catch((err) => {
  console.error(`\n${red}error:${reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

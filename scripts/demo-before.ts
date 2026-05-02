// scripts/demo-before.ts — pre-login portion of the demo.
//
// AI: navigate landing → sign-in URL → click 'Sign in using root user email'.
// You: type root email + password in Chrome.
// Script: auto-detects sign-in completion and exits cleanly.
//
// Run: npm run demo:before
// Then sign in. When you see the script say "✓ signed in", run:
//        npm run demo:after

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
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function waitForSignIn(cdp: CDPSession, timeoutMs = 5 * 60 * 1000): Promise<void> {
  const start = Date.now();
  let lastLogged = "";

  let manuallySkipped = false;
  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      const buf = data as Buffer;
      if (buf[0] === 13 || buf[0] === 10) manuallySkipped = true;
      if (buf[0] === 3) process.exit(0);
    });
  }

  process.stdout.write(`${yellow}  watching browser URL — auto-continues when you sign in (Enter to skip)…${reset}\n`);

  while (Date.now() - start < timeoutMs) {
    if (manuallySkipped) { console.log(`  ${green}→ skipped${reset}`); break; }
    let url = "";
    try { url = await cdp.getCurrentUrl(); } catch {}
    if (url && url !== lastLogged) {
      console.log(`  ${dim}URL: ${url.slice(0, 100)}${url.length > 100 ? "…" : ""}${reset}`);
      lastLogged = url;
    }
    if (url.includes("console.aws.amazon.com") && !url.includes("signin.aws.amazon.com")) {
      console.log(`  ${green}✓ signed in — pre-login flow done${reset}`);
      break;
    }
    await sleep(500);
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(false);
    process.stdin.pause();
    process.stdin.removeAllListeners("data");
  }
}

const TOTAL = 4;

(async () => {
  console.log(`${cyan}━━ demo:before — pre-login flow ━━${reset}`);
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

  step(1, TOTAL, "AI: navigate to AWS free-tier landing");
  await cdp.navigate("https://aws.amazon.com/free/", DELAY_MS);
  ok("page loaded");

  step(2, TOTAL, "AI: click Sign In to Console");
  await cdp.navigate("https://signin.aws.amazon.com/console", DELAY_MS);
  ok("on sign-in page");

  step(3, TOTAL, "AI: click 'Sign in using root user email'");
  const btnSelector = "#root_account_signin, [data-testid='not-sign-in-with-iam']";
  if (!(await cdp.waitForSelector(btnSelector, 8000))) {
    info("root-user button didn't appear in time. Click it manually if visible.");
  } else {
    if (await cdp.click(btnSelector)) {
      ok("clicked root-user button");
      await sleep(1500);
    }
  }

  step(4, TOTAL, "you: type root email + password — script auto-detects when you're in");
  await waitForSignIn(cdp);

  console.log(`\n${green}━━ pre-login done ━━${reset}`);
  info("Now run: npm run demo:after");
  cdp.close();
})().catch((err) => {
  console.error(`\n${red}error:${reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

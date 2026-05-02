// scripts/demo-cdp.ts — AI-driven AWS sign-in flow via Chrome DevTools Protocol.
//
// AI literally clicks the "Sign in using root user email" button in Chrome,
// then pauses for you to type your credentials, then navigates through the
// console pages. No Playwright, no mouse-coordinate guessing — just CDP.
//
// Setup (one-time):
//   1. Run: npm run chrome:debug
//      → opens a dedicated demo Chrome with --remote-debugging-port=9222
//      → log into your AWS account ONCE in this Chrome (cookies persist)
//   2. Leave that Chrome open
//
// Then run the demo:
//   npm run demo:cdp
//
// Tunables:
//   DELAY_MS=8000 npm run demo:cdp     wait 8s between auto-navigations
//   AUTO=1 npm run demo:cdp            don't pause for credentials (when already
//                                      logged in)

import { CDPSession } from "./cdp-helper";

const DELAY_MS = parseInt(process.env.DELAY_MS ?? "5000", 10);
const AUTO = process.env.AUTO === "1";

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

async function waitForEnter(prompt: string): Promise<void> {
  if (AUTO || !process.stdin.isTTY) {
    await sleep(DELAY_MS);
    return;
  }
  process.stdout.write(`${yellow}  ${prompt}${reset}`);
  await new Promise<void>((resolve) => {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      const buf = data as Buffer;
      if (buf[0] === 3) process.exit(0); // Ctrl+C
      resolve();
    });
  });
  console.log("");
}

// Poll Chrome's URL until it changes to a logged-in console URL.
// Sign-in completion = URL leaves signin.aws.amazon.com → console.aws.amazon.com.
// Fast-path: if user wants to skip waiting they can press Enter.
async function waitForSignIn(cdp: import("./cdp-helper").CDPSession, timeoutMs = 5 * 60 * 1000): Promise<void> {
  const start = Date.now();
  let lastLogged = "";

  // Listen for keypress so user can manually skip if needed
  let manuallySkipped = false;
  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      const buf = data as Buffer;
      if (buf[0] === 13 || buf[0] === 10) manuallySkipped = true; // Enter
      if (buf[0] === 3) process.exit(0); // Ctrl+C
    });
  }

  process.stdout.write(`${yellow}  watching browser URL — auto-continues when you sign in (or press Enter to skip)…${reset}\n`);

  while (Date.now() - start < timeoutMs) {
    if (manuallySkipped) {
      console.log(`  ${green}→ skipped${reset}`);
      break;
    }
    let url = "";
    try {
      url = await cdp.getCurrentUrl();
    } catch {
      // CDP can hiccup during navigation — retry next tick
    }
    if (url && url !== lastLogged) {
      console.log(`  ${dim}URL: ${url.slice(0, 100)}${url.length > 100 ? "…" : ""}${reset}`);
      lastLogged = url;
    }
    // Detect: URL contains console.aws.amazon.com but NOT signin.aws.amazon.com
    if (
      url.includes("console.aws.amazon.com") &&
      !url.includes("signin.aws.amazon.com")
    ) {
      console.log(`  ${green}✓ signed in — auto-advancing${reset}`);
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

const TOTAL = 6;

(async () => {
  console.log(`${cyan}━━ demo:cdp — AI driving Chrome via DevTools Protocol ━━${reset}`);
  info(`connecting to Chrome at localhost:9222 …`);

  let cdp: CDPSession;
  try {
    cdp = await CDPSession.connect(9222);
    ok("connected");
  } catch (err) {
    fail(`couldn't connect: ${err instanceof Error ? err.message : String(err)}`);
    info("Run 'npm run chrome:debug' first to launch Chrome with the debug port.");
    process.exit(1);
  }

  // ─── 1. AWS free-tier landing
  step(1, TOTAL, "AI: navigate to AWS free-tier landing");
  await cdp.navigate("https://aws.amazon.com/free/", DELAY_MS);
  ok("page loaded");

  // ─── 2. Sign-in URL
  step(2, TOTAL, "AI: click Sign In to Console");
  await cdp.navigate("https://signin.aws.amazon.com/console", DELAY_MS);
  ok("on sign-in page");

  // ─── 3. Auto-click "Sign in using root user email"
  step(3, TOTAL, "AI: click 'Sign in using root user email'");
  const btnSelector = "#root_account_signin, [data-testid='not-sign-in-with-iam']";
  if (!(await cdp.waitForSelector(btnSelector, 8000))) {
    fail("root-user button didn't appear (page may have changed). Click manually.");
  } else {
    if (await cdp.click(btnSelector)) {
      ok("clicked root-user button");
      await sleep(2000); // wait for next page transition
    } else {
      fail("click failed (selector matched but click did nothing)");
    }
  }

  // ─── 4. Wait for user to sign in — auto-detected via URL polling
  step(4, TOTAL, "you: type root email + password — script auto-detects when you're in");
  await waitForSignIn(cdp);

  // ─── 5. Console home
  step(5, TOTAL, "AI: navigate to EC2 dashboard");
  await cdp.navigate(
    "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Home:",
    DELAY_MS
  );
  ok("on EC2 dashboard");

  // ─── 6. Launch wizard
  step(6, TOTAL, "AI: navigate to launch wizard");
  await cdp.navigate(
    "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#LaunchInstances:",
    DELAY_MS
  );
  ok("on launch wizard — ready for SDK takeover");

  console.log(`\n${green}━━ browser flow done ━━${reset}`);
  info("Next: SDK does the actual launch + SSH install. Run:");
  info("  npm run test:aws launch    (or: npm run demo:cli-only)");

  cdp.close();
})().catch((err) => {
  console.error(`\n${red}error:${reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

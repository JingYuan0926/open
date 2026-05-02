// scripts/demo-before.ts — pre-login portion of the demo (simple URL opens).
//
// Uses your default Chrome (cmd.exe / open / xdg-open) — no debug port,
// no CDP, no chrome:debug setup needed.
//
// Flow:
//   1. AWS free-tier landing               [auto, 7s]
//   2. Sign-in page (you sign in here)     [WAIT, press Enter when logged in]
//
// Then run: npm run demo:after

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

async function waitForEnter(prompt: string): Promise<void> {
  if (!process.stdin.isTTY) { await sleep(DELAY_MS); return; }
  process.stdout.write(`${yellow}  ${prompt}${reset}`);
  await new Promise<void>((resolve) => {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      const buf = data as Buffer;
      if (buf[0] === 3) process.exit(0);
      resolve();
    });
  });
  console.log("");
}

(async () => {
  console.log(`${cyan}━━ demo:before — pre-login flow ━━${reset}`);

  step(1, 2, "AWS free-tier landing");
  await openUrl("https://aws.amazon.com/free/");
  ok("opened");
  info(`auto-advancing in ${DELAY_MS}ms…`);
  await sleep(DELAY_MS);

  step(2, 2, "Sign in (Chrome redirects through OAuth → sign-in form)");
  await openUrl("https://signin.aws.amazon.com/console");
  ok("opened — sign in to AWS in Chrome");

  await waitForEnter(`Press Enter once you're signed in → demo:before exits cleanly`);

  console.log(`\n${green}━━ pre-login done ━━${reset}`);
  info("Now run: npm run demo:after");
})().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

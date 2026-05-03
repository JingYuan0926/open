// scripts/demo-aws-1.ts — Step 1 of the live demo: open AWS sign-in.
//
// Opens AWS landing + sign-in pages in the user's default Chrome.
// User signs in at their own pace, then runs:
//   npm run demo:aws-2
//
// Run on its own:
//   npm run demo:aws-1

import { openUrl } from "../axl/mcp-servers/aws-helpers/browser";

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  console.log(`${cyan}━━ demo:aws-1 — open AWS sign-in ━━${reset}\n`);

  console.log(`${yellow}→${reset} Opening AWS landing page…`);
  await openUrl("https://aws.amazon.com/free/");
  await sleep(1500);

  console.log(`${yellow}→${reset} Opening AWS console sign-in…`);
  await openUrl("https://signin.aws.amazon.com/console");

  console.log(`\n${green}✓ Browser opened.${reset}`);
  console.log(`${dim}Sign in to AWS in Chrome, then run:${reset}`);
  console.log(`${yellow}    npm run demo:aws-2${reset}\n`);

  if (process.stdin.isTTY) {
    process.stdout.write(`${dim}Press Enter to close this window…${reset}`);
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
  }
})().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

// scripts/test-browser.ts — sequence of URL navigations in Chrome.
//
// Same code path as the MCP `open_console` and `show_in_console` tools.
//
// Default flow walks the AWS account-creation flow which requires actual
// user interaction (typing email, password, clicking buttons), so by
// default the script PAUSES after each URL and waits for you to press
// Enter before opening the next one. Lets you sign up / sign in at your
// own pace.
//
// Run:
//   npm run test:browser                           (pause for Enter between URLs)
//   AUTO=1 npm run test:browser                    (auto-advance with DELAY_MS gap)
//   npm run test:browser -- <url1> <url2> [url3]   (custom URL list)
//   DELAY_MS=8000 npm run test:browser             (when AUTO=1: slower walk)
//   BROWSER=msedge npm run test:browser            (Edge instead of Chrome)

import { detectOpener, openUrl } from "../axl/mcp-servers/aws-helpers/browser";

// Default flow with per-step pacing.
//   pause: true  → wait for Enter after this URL (user is typing credentials,
//                  filling forms, or doing some other interactive action)
//   pause: false → auto-advance after DELAY_MS (just navigation)
//
// Only the credential-entry page pauses by default; everything else flows.
//
// Note on session-bound URLs: OAuth/sign-in URLs with code_challenge+state
// expire. For repeat demos, swap the generic https://signin.aws.amazon.com/console
type Step = { url: string; pause: boolean; label: string };

// Using GENERIC sign-in URL (https://signin.aws.amazon.com/console) instead
// of OAuth deep-links with code_challenge/state — those expire after one use.
// The generic URL triggers a fresh OAuth flow each time, so demo is repeatable.
//
// We open the sign-in URL TWICE on purpose:
//   step 2 — AI is "navigating to sign-in" (flashes OAuth, lands on sign-in form)
//   step 3 — AI has "selected root user", user takes over to type credentials
// Visually feels like two distinct AI actions, even though the URL is the same.
const DEFAULT_STEPS: Step[] = [
  { label: "AWS free-tier landing", pause: false,
    url: "https://aws.amazon.com/free/" },
  { label: "AI navigating to sign-in (OAuth flash)", pause: false,
    url: "https://signin.aws.amazon.com/console" },
  // ★ PAUSE here — re-open the sign-in form, user types credentials
  { label: "AI clicked root, you type email + password here", pause: true,
    url: "https://signin.aws.amazon.com/console" },
  { label: "Console home", pause: false,
    url: "https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1#" },
  { label: "EC2 dashboard", pause: false,
    url: "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Home:" },
  { label: "Launch wizard", pause: false,
    url: "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#LaunchInstances:" },
];

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

const cliUrls = process.argv.slice(2);
// CLI URLs override the default flow. CLI URLs default to all-pause so user
// can step through arbitrary URL lists; flip with AUTO=1.
const steps: Step[] = cliUrls.length > 0
  ? cliUrls.map(url => ({ url, pause: true, label: url.slice(0, 50) }))
  : DEFAULT_STEPS;
const AUTO = process.env.AUTO === "1";
const delayMs = parseInt(process.env.DELAY_MS ?? "7000", 10);

async function waitForEnter(promptMsg: string): Promise<void> {
  if (!process.stdin.isTTY) {
    // No TTY (e.g. piped stdin) — fall back to a delay
    await new Promise(r => setTimeout(r, delayMs));
    return;
  }
  process.stdout.write(`${yellow}  ${promptMsg}${reset}`);
  await new Promise<void>((resolve) => {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      // Ctrl+C handling — exit gracefully
      const buf = data as Buffer;
      if (buf[0] === 3) process.exit(0);
      resolve();
    });
  });
  console.log("");
}

(async () => {
  const opener = detectOpener();
  console.log(`${cyan}━━ test-browser ━━${reset}`);
  console.log(`${dim}opener: ${opener.cmd} ${opener.args("<url>").filter(Boolean).join(" ")}${reset}`);
  if (AUTO) {
    console.log(`${dim}AUTO=1 — auto-advance every step (${delayMs}ms gap)${reset}`);
  } else {
    const pauseCount = steps.filter(s => s.pause).length;
    console.log(`${dim}${steps.length} URLs total — ${pauseCount} pause for input, rest auto-advance every ${delayMs}ms${reset}`);
  }
  console.log("");

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const stepNum = i + 1;
    const tag = s.pause && !AUTO ? `${cyan}[wait]${reset}` : `${dim}[auto]${reset}`;
    console.log(`${yellow}step ${stepNum}/${steps.length}${reset} ${tag} ${s.label}`);
    console.log(`${dim}  ${s.url.slice(0, 90)}${s.url.length > 90 ? "…" : ""}${reset}`);
    await openUrl(s.url);
    console.log(`${green}  ✓ opened${reset}`);

    if (i < steps.length - 1) {
      const shouldPause = s.pause && !AUTO;
      if (shouldPause) {
        await waitForEnter(`Finish on this page, then press Enter → next URL (Ctrl+C to quit)`);
      } else {
        console.log(`${dim}  auto-advancing in ${delayMs}ms…${reset}`);
        await new Promise(r => setTimeout(r, delayMs));
      }
      console.log("");
    }
  }

  console.log("");
  console.log(`${green}━━ done — ${steps.length} pages opened ━━${reset}`);
})().catch(err => {
  console.error(`\nerror: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

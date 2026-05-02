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

// ┌──────────────────────────────────────────────────────────────────────────┐
// │  WARNING: SIGNIN_OAUTH_URL and SIGNIN_FORM_URL are SESSION-BOUND.        │
// │  They contain a one-time PKCE code_challenge that AWS consumes after     │
// │  one OAuth round-trip. After running this demo once, those URLs WILL     │
// │  return:                                                                  │
// │    {"error":"invalid_request","error_description":"Missing required ..."}│
// │    400 Bad Request                                                        │
// │  Before each fresh demo, open Chrome → AWS landing → click "Sign In to   │
// │  Console" → copy the URL from the address bar (that's the OAuth URL),    │
// │  then click root → copy that URL too (sign-in form URL). Update the      │
// │  constants below, OR pass via env:                                       │
// │    SIGNIN_OAUTH_URL='...' SIGNIN_FORM_URL='...' npm run test:browser     │
// │  For repeatable demos that DON'T expire, replace both with the generic   │
// │  https://signin.aws.amazon.com/console (AWS handles OAuth internally).   │
// └──────────────────────────────────────────────────────────────────────────┘

const SIGNIN_OAUTH_URL = process.env.SIGNIN_OAUTH_URL ??
  "https://ap-southeast-2.signin.aws.amazon.com/oauth?client_id=arn%3Aaws%3Asignin%3A%3A%3Aconsole%2Fcanvas&code_challenge=hXPl7H-TkMS1mKei2sv9nXvIBI0Bo_JVSuorizlFYGY&code_challenge_method=SHA-256&response_type=code&redirect_uri=https%3A%2F%2Fconsole.aws.amazon.com%2Fconsole%2Fhome%3Fca-oauth-flow-id%3Dc71b%26hashArgs%3D%2523%26isauthcode%3Dtrue%26oauthStart%3D1777728980985%26state%3DhashArgsFromTB_ap-southeast-2_7158060899730700";

const SIGNIN_FORM_URL = process.env.SIGNIN_FORM_URL ??
  "https://signin.aws.amazon.com/signin?client_id=arn%3Aaws%3Asignin%3A%3A%3Aconsole%2Fcanvas&redirect_uri=https%3A%2F%2Fconsole.aws.amazon.com%2Fconsole%2Fhome%3Fca-oauth-flow-id%3Dc71b%26hashArgs%3D%2523%26isauthcode%3Dtrue%26oauthStart%3D1777728980985%26state%3DhashArgsFromTB_ap-southeast-2_7158060899730700&page=resolve&code_challenge=hXPl7H-TkMS1mKei2sv9nXvIBI0Bo_JVSuorizlFYGY&code_challenge_method=SHA-256&backwards_compatible=true";

const DEFAULT_STEPS: Step[] = [
  { label: "AWS free-tier landing", pause: false,
    url: "https://aws.amazon.com/free/" },
  { label: "AI navigating to sign-in (OAuth flash)", pause: false,
    url: SIGNIN_OAUTH_URL },
  // ★ PAUSE here — sign-in form, user types root email + password
  { label: "AI clicked root, you type email + password here", pause: true,
    url: SIGNIN_FORM_URL },
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

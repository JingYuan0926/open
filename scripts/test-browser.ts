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

// Default flow: AWS free-tier landing → signup page → sign-in page.
// AI handles navigation; user types credentials themselves at the sign-in
// step (auth is the user's job, not the AI's — MCP execution moat).
//
// Add more URLs to extend the narrative (e.g. console home → IAM → EC2).
//
// Note on the sign-in URL: the long OAuth one with code_challenge/state is
// session-bound and expires. For repeat demos, swap in the generic:
//   https://signin.aws.amazon.com/console
const DEFAULT_URLS = [
  // 1. AWS free-tier landing
  "https://aws.amazon.com/free/?trk=06dd4e64-3ddf-405e-bec9-d2414185926c&sc_channel=ps&ef_id=CjwKCAjwntHPBhAaEiwA_Xp6RnY7G9dZSmhU0VN020DtbAGdylUEVlHhJo1aVZtg-qgsAyMYQNVwjRoCB7sQAvD_BwE:G:s&s_kwcid=AL!4422!3!798628412789!e!!g!!aws!23606217014!196761071947&gad_campaignid=23606217014&gbraid=0AAAAADjHtp-Y4t6OtBT9be4A-mk1PZ4NA&gclid=CjwKCAjwntHPBhAaEiwA_Xp6RnY7G9dZSmhU0VN020DtbAGdylUEVlHhJo1aVZtg-qgsAyMYQNVwjRoCB7sQAvD_BwE",
  // 2. Signup form
  "https://signin.aws.amazon.com/signup?request_type=register&trk=06dd4e64-3ddf-405e-bec9-d2414185926c&sc_channel=ps",
  // 3. Sign-in OAuth landing
  "https://ap-southeast-2.signin.aws.amazon.com/oauth?client_id=arn%3Aaws%3Asignin%3A%3A%3Aconsole%2Fcanvas&code_challenge=zp9yZvuW7Y8NKnoaaROzZ8ew5F8PcdtJgPucPpwpK8I&code_challenge_method=SHA-256&response_type=code&redirect_uri=https%3A%2F%2Fconsole.aws.amazon.com%2Fconsole%2Fhome%3Fca-oauth-flow-id%3D29dc%26hashArgs%3D%2523%26isauthcode%3Dtrue%26oauthStart%3D1777701383684%26state%3DhashArgsFromTB_ap-southeast-2_2b6ff061c8208fa1",
  // 4. Sign-in root email (user types here)
  "https://signin.aws.amazon.com/signin?client_id=arn%3Aaws%3Asignin%3A%3A%3Aconsole%2Fcanvas&redirect_uri=https%3A%2F%2Fconsole.aws.amazon.com%2Fconsole%2Fhome%3Fca-oauth-flow-id%3D29dc%26hashArgs%3D%2523%26isauthcode%3Dtrue%26oauthStart%3D1777701383684%26state%3DhashArgsFromTB_ap-southeast-2_2b6ff061c8208fa1&page=resolve&code_challenge=zp9yZvuW7Y8NKnoaaROzZ8ew5F8PcdtJgPucPpwpK8I&code_challenge_method=SHA-256&backwards_compatible=true",
  // 5. Console home (after sign-in)
  "https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1#",
  // 6. EC2 dashboard
  "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1",
  // 7. Launch wizard — last browser step. After this the demo transitions to
  //    SDK calls (RunInstances + ssh2) — instead of clicking through the
  //    wizard's name/AMI/type/keypair/sg pages, the AI calls RunInstances
  //    directly with all params hardcoded. See `npm run test:aws launch`.
  "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#LaunchInstances:",
];

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

const cliUrls = process.argv.slice(2);
const urls = cliUrls.length > 0 ? cliUrls : DEFAULT_URLS;
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
    console.log(`${dim}AUTO=1 — auto-advance with ${delayMs}ms between URLs${reset}`);
  } else {
    console.log(`${dim}interactive mode — press Enter to advance to next URL (set AUTO=1 to auto-walk)${reset}`);
  }
  console.log(`${dim}${urls.length} URL${urls.length === 1 ? "" : "s"} total${reset}`);
  console.log("");

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const stepNum = i + 1;
    console.log(`${yellow}step ${stepNum}/${urls.length}${reset}: opening`);
    console.log(`${dim}  ${url.slice(0, 90)}${url.length > 90 ? "…" : ""}${reset}`);
    await openUrl(url);
    console.log(`${green}  ✓ opened${reset}`);

    if (i < urls.length - 1) {
      if (AUTO) {
        console.log(`${dim}  waiting ${delayMs}ms before next step…${reset}`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        await waitForEnter(`Press Enter when done with this page → next URL (Ctrl+C to quit)`);
      }
      console.log("");
    }
  }

  console.log("");
  console.log(`${green}━━ done — ${urls.length} pages opened ━━${reset}`);
})().catch(err => {
  console.error(`\nerror: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

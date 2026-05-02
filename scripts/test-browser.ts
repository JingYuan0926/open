// scripts/test-browser.ts — sequence of URL navigations in Chrome.
//
// Same code path as the MCP `open_console` and `show_in_console` tools.
// If this works on your machine, the demo's browser-open steps will work too.
//
// Default: walks the AWS account-creation flow (free-tier → signup) with a
// 5s pause between each page. Pass any number of URLs on the CLI to override.
//
// Run:
//   npm run test:browser
//   npm run test:browser -- <url1> <url2> [url3] [url4]…
//   DELAY_MS=8000 npm run test:browser    (slower walk)
//   BROWSER=msedge npm run test:browser   (Edge instead of Chrome)

import { detectOpener, openUrl } from "../axl/mcp-servers/aws-helpers/browser";

// Default flow: AWS free-tier landing → signup page.
// Add more URLs to walk a longer narrative (e.g. signup → console → IAM → EC2).
const DEFAULT_URLS = [
  "https://aws.amazon.com/free/?trk=06dd4e64-3ddf-405e-bec9-d2414185926c&sc_channel=ps&ef_id=CjwKCAjwntHPBhAaEiwA_Xp6RnY7G9dZSmhU0VN020DtbAGdylUEVlHhJo1aVZtg-qgsAyMYQNVwjRoCB7sQAvD_BwE:G:s&s_kwcid=AL!4422!3!798628412789!e!!g!!aws!23606217014!196761071947&gad_campaignid=23606217014&gbraid=0AAAAADjHtp-Y4t6OtBT9be4A-mk1PZ4NA&gclid=CjwKCAjwntHPBhAaEiwA_Xp6RnY7G9dZSmhU0VN020DtbAGdylUEVlHhJo1aVZtg-qgsAyMYQNVwjRoCB7sQAvD_BwE",
  "https://signin.aws.amazon.com/signup?request_type=register&trk=06dd4e64-3ddf-405e-bec9-d2414185926c&sc_channel=ps",
];

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

const cliUrls = process.argv.slice(2);
const urls = cliUrls.length > 0 ? cliUrls : DEFAULT_URLS;
const delayMs = parseInt(process.env.DELAY_MS ?? "5000", 10);

(async () => {
  const opener = detectOpener();
  console.log(`${cyan}━━ test-browser ━━${reset}`);
  console.log(`${dim}opener: ${opener.cmd} ${opener.args("<url>").filter(Boolean).join(" ")}${reset}`);
  console.log(`${dim}walking ${urls.length} URL${urls.length === 1 ? "" : "s"} with ${delayMs}ms between each${reset}`);
  console.log("");

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const stepNum = i + 1;
    console.log(`${yellow}step ${stepNum}/${urls.length}${reset}: opening`);
    console.log(`${dim}  ${url.slice(0, 90)}${url.length > 90 ? "…" : ""}${reset}`);
    await openUrl(url);
    console.log(`${green}  ✓ opened${reset}`);

    if (i < urls.length - 1) {
      console.log(`${dim}  waiting ${delayMs}ms before next step…${reset}`);
      await new Promise(r => setTimeout(r, delayMs));
      console.log("");
    }
  }

  console.log("");
  console.log(`${green}━━ done — ${urls.length} pages opened in sequence ━━${reset}`);
})().catch(err => {
  console.error(`\nerror: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

// scripts/test-browser.ts — verify cross-platform browser opening on this machine.
//
// Opens 2 AWS URLs in sequence with a 4s delay. Same code path as the MCP
// `open_console` and `show_in_console` tools — if this works in your terminal,
// the demo's browser-open steps will work too.
//
// Usage:
//   npm run test:browser
//   npm run test:browser -- <url1> <url2>     (custom URLs)

import { detectOpener, openUrl } from "../axl/mcp-servers/aws-helpers/browser";

// Defaults: AWS free-tier landing → signup page.
// You can override on the CLI: npm run test:browser -- <url1> <url2>
const DEFAULT_URL_1 = "https://aws.amazon.com/free/?trk=06dd4e64-3ddf-405e-bec9-d2414185926c&sc_channel=ps&ef_id=CjwKCAjwntHPBhAaEiwA_Xp6RnY7G9dZSmhU0VN020DtbAGdylUEVlHhJo1aVZtg-qgsAyMYQNVwjRoCB7sQAvD_BwE:G:s&s_kwcid=AL!4422!3!798628412789!e!!g!!aws!23606217014!196761071947&gad_campaignid=23606217014&gbraid=0AAAAADjHtp-Y4t6OtBT9be4A-mk1PZ4NA&gclid=CjwKCAjwntHPBhAaEiwA_Xp6RnY7G9dZSmhU0VN020DtbAGdylUEVlHhJo1aVZtg-qgsAyMYQNVwjRoCB7sQAvD_BwE";
const DEFAULT_URL_2 = "https://signin.aws.amazon.com/signup?request_type=register&trk=06dd4e64-3ddf-405e-bec9-d2414185926c&sc_channel=ps";

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

const url1 = process.argv[2] || DEFAULT_URL_1;
const url2 = process.argv[3] || DEFAULT_URL_2;

(async () => {
  const opener = detectOpener();
  console.log(`${cyan}━━ test-browser ━━${reset}`);
  console.log(`${dim}detected opener: ${opener.cmd} ${opener.args("<url>").join(" ")}${reset}`);
  console.log("");

  console.log(`${yellow}step 1${reset}: opening AWS free-tier`);
  console.log(`${dim}  ${url1.slice(0, 80)}${url1.length > 80 ? "…" : ""}${reset}`);
  await openUrl(url1);
  console.log(`${green}  ✓ opened${reset}`);
  console.log("");

  console.log(`${dim}waiting 4s before next URL…${reset}`);
  await new Promise(r => setTimeout(r, 4000));
  console.log("");

  console.log(`${yellow}step 2${reset}: opening AWS signup`);
  console.log(`${dim}  ${url2.slice(0, 80)}${url2.length > 80 ? "…" : ""}${reset}`);
  await openUrl(url2);
  console.log(`${green}  ✓ opened${reset}`);
  console.log("");

  console.log(`${green}━━ both URLs opened ━━${reset}`);
  console.log(`${dim}If you saw both pages appear in your browser, the URL-navigation flow works on this machine.${reset}`);
})().catch(err => {
  console.error(`\nerror: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

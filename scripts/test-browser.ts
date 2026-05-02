// scripts/test-browser.ts — verify cross-platform browser opening + AI-like mouse movement.
//
// Flow:
//   1. Open URL 1 in Chrome (AWS free-tier)
//   2. Wait for page to load
//   3. Smoothly glide cursor across screen to where the signup button typically sits (Windows only)
//   4. Pause (hover effect)
//   5. Open URL 2 in Chrome (AWS signup page)
//
// Run:
//   npm run test:browser
//   npm run test:browser -- <url1> <url2>     (custom URLs)
//   NO_MOUSE=1 npm run test:browser            (skip cursor animation)

import { detectOpener, openUrl } from "../axl/mcp-servers/aws-helpers/browser";
import { moveMouse, getScreenSize } from "../axl/mcp-servers/aws-helpers/mouse";

const DEFAULT_URL_1 = "https://aws.amazon.com/free/?trk=06dd4e64-3ddf-405e-bec9-d2414185926c&sc_channel=ps&ef_id=CjwKCAjwntHPBhAaEiwA_Xp6RnY7G9dZSmhU0VN020DtbAGdylUEVlHhJo1aVZtg-qgsAyMYQNVwjRoCB7sQAvD_BwE:G:s&s_kwcid=AL!4422!3!798628412789!e!!g!!aws!23606217014!196761071947&gad_campaignid=23606217014&gbraid=0AAAAADjHtp-Y4t6OtBT9be4A-mk1PZ4NA&gclid=CjwKCAjwntHPBhAaEiwA_Xp6RnY7G9dZSmhU0VN020DtbAGdylUEVlHhJo1aVZtg-qgsAyMYQNVwjRoCB7sQAvD_BwE";
const DEFAULT_URL_2 = "https://signin.aws.amazon.com/signup?request_type=register&trk=06dd4e64-3ddf-405e-bec9-d2414185926c&sc_channel=ps";

const cyan = "\x1b[36m";
const yellow = "\x1b[1;33m";
const green = "\x1b[32m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

const url1 = process.argv[2] || DEFAULT_URL_1;
const url2 = process.argv[3] || DEFAULT_URL_2;
const skipMouse = process.env.NO_MOUSE === "1";

(async () => {
  const opener = detectOpener();
  console.log(`${cyan}━━ test-browser ━━${reset}`);
  console.log(`${dim}detected opener: ${opener.cmd} ${opener.args("<url>").filter(Boolean).join(" ")}${reset}`);

  // Detect screen size for proportional cursor positions.
  let screen = { width: 1536, height: 864 };
  if (!skipMouse) {
    try {
      screen = await getScreenSize();
      console.log(`${dim}screen: ${screen.width}x${screen.height}${reset}`);
    } catch {
      console.log(`${dim}screen-size detection failed; using defaults${reset}`);
    }
  }
  console.log("");

  // ─────────────────────────────────────────────
  console.log(`${yellow}step 1${reset}: opening AWS free-tier in Chrome`);
  console.log(`${dim}  ${url1.slice(0, 80)}${url1.length > 80 ? "…" : ""}${reset}`);
  await openUrl(url1);
  console.log(`${green}  ✓ opened${reset}`);
  console.log("");

  console.log(`${dim}waiting 3s for page to load…${reset}`);
  await new Promise(r => setTimeout(r, 3000));
  console.log("");

  // ─────────────────────────────────────────────
  if (!skipMouse) {
    console.log(`${yellow}step 2${reset}: AI-like cursor glide → signup button area`);
    // Default: end at upper-right where the AWS "Create a Free Account" CTA
    // sits on a 1536x864 layout. Override with MOUSE_TO_X / MOUSE_TO_Y env vars
    // (use `npm run mouse:where` to find the right values for your screen).
    const toX = process.env.MOUSE_TO_X ? parseInt(process.env.MOUSE_TO_X, 10)
      : Math.round(screen.width * 0.78);
    const toY = process.env.MOUSE_TO_Y ? parseInt(process.env.MOUSE_TO_Y, 10)
      : Math.round(screen.height * 0.28);
    // Don't pass fromX/fromY — script reads current cursor position so the
    // glide starts naturally from wherever the cursor is now (no teleport).
    console.log(`${dim}  glide: <current pos> → (${toX},${toY}) over 1.5s${reset}`);
    await moveMouse({ toX, toY, durationMs: 1500 });
    console.log(`${green}  ✓ glided${reset}`);
    console.log(`${dim}  hover 1s…${reset}`);
    await new Promise(r => setTimeout(r, 1000));
    console.log("");
  }

  // ─────────────────────────────────────────────
  console.log(`${yellow}step 3${reset}: opening AWS signup`);
  console.log(`${dim}  ${url2.slice(0, 80)}${url2.length > 80 ? "…" : ""}${reset}`);
  await openUrl(url2);
  console.log(`${green}  ✓ opened${reset}`);
  console.log("");

  console.log(`${green}━━ done ━━${reset}`);
  console.log(`${dim}If you saw the cursor glide between the AWS pages, the AI-execution feel is wired up.${reset}`);
  console.log(`${dim}Set NO_MOUSE=1 to skip the cursor animation.${reset}`);
})().catch(err => {
  console.error(`\nerror: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

// scripts/capture-urls.ts — capture FRESH AWS OAuth + sign-in URLs via CDP.
//
// Connects to the debug Chrome (npm run chrome:debug must be running),
// navigates to https://signin.aws.amazon.com/console which causes AWS to
// generate a fresh PKCE code_challenge and redirect through the OAuth flow.
// We then read the URL and the navigation history to extract:
//   - the OAuth URL (long, /oauth?client_id=...)
//   - the sign-in form URL (long, /signin?...&page=resolve)
//
// Both URLs are paired (same code_challenge) and freshly generated, so
// they're un-consumed and ready to demo with.
//
// Output (machine-parseable, shell-eval friendly):
//   SIGNIN_OAUTH_URL='https://...'
//   SIGNIN_FORM_URL='https://...'
//
// Use as:
//   eval $(npm run --silent capture-urls)
//   npm run test:browser
// Or just inspect the URLs and copy them manually.

import { CDPSession } from "./cdp-helper";

const dim = "\x1b[2m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const reset = "\x1b[0m";

function logErr(msg: string) { process.stderr.write(`${dim}${msg}${reset}\n`); }

(async () => {
  logErr(`connecting to Chrome at localhost:9222 …`);
  let cdp: CDPSession;
  try {
    cdp = await CDPSession.connect(9222, 5);
  } catch {
    process.stderr.write(`${red}error:${reset} couldn't reach Chrome at localhost:9222.\n`);
    process.stderr.write(`run 'npm run chrome:debug' first, then re-run this.\n`);
    process.exit(1);
  }
  logErr("connected.");

  // Navigate to the sign-in URL — AWS generates fresh PKCE codes and redirects.
  logErr("navigating to signin.aws.amazon.com/console …");
  await cdp.navigate("https://signin.aws.amazon.com/console", 4000);

  // Read the URL the browser ended up at + the redirect history.
  const finalUrl = await cdp.getCurrentUrl();
  const history = await cdp.getNavigationHistory();

  logErr(`final URL: ${finalUrl.slice(0, 100)}${finalUrl.length > 100 ? "…" : ""}`);
  logErr(`navigation history (${history.length} entries):`);
  for (const e of history) {
    const u = (e.url ?? "").slice(0, 120);
    logErr(`  - ${u}${(e.url ?? "").length > 120 ? "…" : ""}`);
  }

  // Pick the URLs we care about.
  const oauthUrl = history.find((e) => /\/oauth\?/.test(e.url ?? ""))?.url;
  const signinUrl = history.find(
    (e) => /\/signin\?/.test(e.url ?? "") && /page=resolve/.test(e.url ?? "")
  )?.url ?? finalUrl;

  if (!oauthUrl) {
    process.stderr.write(`${red}warning:${reset} couldn't find an OAuth URL in history. AWS may have skipped it (already authenticated?).\n`);
  }

  // Output to stdout in shell-eval format.
  if (oauthUrl) console.log(`export SIGNIN_OAUTH_URL='${oauthUrl}'`);
  console.log(`export SIGNIN_FORM_URL='${signinUrl}'`);

  process.stderr.write(`\n${green}✓ captured.${reset} pipe to env:\n`);
  process.stderr.write(`  eval $(npm run --silent capture-urls)\n`);
  process.stderr.write(`  npm run test:browser\n`);

  cdp.close();
})().catch((err) => {
  process.stderr.write(`${red}error:${reset} ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

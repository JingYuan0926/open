---
name: playwright
description: Drive a browser by CSS/XPath selectors. Faster, more deterministic, and far cheaper than vision-based clicking when the target has a stable DOM.
priority: preferred-when-applicable
when_to_use: The target is a webpage with stable selectors. Anything you'd previously do with Selenium. Form fills, link follows, multi-step navigation, OAuth flows, scraping into JSON. Pair with `computer-use` only when the DOM stops being reachable (canvas-only games, image-only PDFs).
when_to_skip: The target is a native app or OS dialog. The page renders into `<canvas>` only (e.g. Figma, some 3D apps) — switch to `computer-use`.
---

# playwright

The default skill for *any* browser-based task. Two operating modes:

1. **Spawn fresh Chromium** — clean profile, scriptable, no user state.
2. **Attach to the user's running Chrome** via the Chrome DevTools Protocol — preserves cookies, logged-in sessions, extensions. This is what production agents almost always want.

## Required setup

```bash
npm install playwright
npx playwright install chromium
```

For **attach mode**, the user's Chrome must be launched with the debug port:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.openclaw-chrome"

# A dedicated user-data-dir is required — Chrome refuses to expose CDP on the default profile.
```

For headless / fresh-profile mode, no Chrome install needed; Playwright manages its own Chromium.

## API surface

```ts
import { chromium, Page, BrowserContext } from "playwright";

// Mode A: fresh profile (clean, no cookies, scripted from zero)
export async function launchFresh(): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  const page = await context.newPage();
  return { context, page };
}

// Mode B: attach to the user's running Chrome via CDP
export async function attach(): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  return { context, page };
}
```

The agent then calls these as composable tools:

```ts
// Navigate
await page.goto("https://example.com", { waitUntil: "domcontentloaded" });

// Click — Playwright auto-waits for visible + enabled + stable
await page.click("button:has-text('Sign in')");

// Fill a form field
await page.fill("input[name='email']", "user@example.com");

// Wait for a selector or URL
await page.waitForSelector(".dashboard");
await page.waitForURL(/\/dashboard/);

// Scrape data
const rows = await page.locator("table tr").allTextContents();

// Run arbitrary JS in the page
const userId = await page.evaluate(() => (window as any).__USER_ID__);

// Screenshot for vision-fallback (e.g. hand off to computer-use if a step fails)
const png = await page.locator("body").screenshot();
```

## Locator strategy (priority order)

Use the highest-specificity, most-stable locator first. This map is the agent's heuristic:

1. `page.getByRole("button", { name: "Submit" })` — accessible role + name; survives styling refactors
2. `page.getByLabel("Email")` — for form inputs with `<label>`
3. `page.getByPlaceholder("you@example.com")` — fallback when no label
4. `page.getByTestId("submit-btn")` — when the page exposes `data-testid`
5. `page.getByText("Sign in", { exact: true })` — when nothing else works
6. CSS / XPath — last resort, brittle

## Multi-tab / popup handling

```ts
const [popup] = await Promise.all([
  context.waitForEvent("page"),                  // OAuth opens a new tab
  page.click("text=Continue with Google"),
]);
await popup.waitForLoadState();
await popup.fill("input[type='email']", "...");
```

## State capture & resume

Save/restore the entire login state (cookies + localStorage + IndexedDB) between sessions:

```ts
// After login:
await context.storageState({ path: "axl/.openclaw-state.json" });

// Next session:
const context = await browser.newContext({ storageState: "axl/.openclaw-state.json" });
```

## When to fall back

| failure signal | fall back to |
|---|---|
| `TimeoutError: Locator not found after 30s` and the element really exists in the screenshot | The target is render-blocked or inside `<canvas>` / Shadow DOM. Switch to `computer-use` for this step. |
| `page.goto` returns `net::ERR_*` | Network issue — surface to user; don't retry blindly. |
| Site detects automation (Cloudflare challenge, "are you a robot") | Try `chromium.launchPersistentContext()` with the user's real profile (`attach` mode), or fall back to `chrome-extension` which runs inside the genuine session. |
| OAuth flow requires SMS / hardware key | Cannot proceed automated — surface to user, pause until they complete it manually, then `attach` resumes. |

## Security

- A persistent profile (`--user-data-dir`) holds the user's real cookies. Treat the path as a secret. Don't ship it off-host. Don't share between machines.
- `page.evaluate(jsCode)` runs arbitrary JS in the target page — never pass model-generated code into it without a sandbox or strict allowlist.
- Auto-screenshot on failure (`screenshot: "only-on-failure"`) is helpful for debugging but stores PII to disk — gate by env var in production.

## Performance

- A single attach + click + wait sequence is ~200ms. `computer-use` for the same is 3–5s and ~$0.02. Use Playwright wherever the DOM gives you a path.
- Reuse the `BrowserContext` across tool calls — recreating it costs ~500ms per call.

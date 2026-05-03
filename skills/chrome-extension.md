---
name: chrome-extension
description: Manipulate the user's actual Chrome session in real time — same cookies, same tabs, same logged-in state. Faster than Playwright, indistinguishable from a human, runs without spawning a separate Chromium.
priority: preferred-when-applicable
when_to_use: The user is already browsing in Chrome and wants the agent to act inside that session — no re-login, no separate window. Especially good for sites with strong anti-automation (Cloudflare, Akamai) where Playwright gets challenged but the user's authenticated tab does not.
when_to_skip: User isn't using Chrome (Safari, Firefox, Arc with no Chrome). User declines to install the extension. Task needs a clean profile with no cookies.
---

# chrome-extension

A Manifest V3 Chrome extension paired with a **Native Messaging Host** that talks to the OpenClaw daemon over stdin/stdout. The agent sends DOM commands; the extension executes them inside any tab the user has open.

## Architecture

```
┌─────────────────────────────────┐         ┌─────────────────────────┐
│  OpenClaw daemon (Node)         │ stdin/  │  Chrome (background.js) │
│  ↳ axl/mcp-servers/chrome.ts    │ stdout  │  ↳ chrome.runtime.      │
│                                 │ ←──────→│    connectNative        │
│  exposes MCP tools:             │  JSON-  │                         │
│   • dom.click(tabId, selector)  │  RPC    │  forwards to active tab │
│   • dom.fill(tabId, sel, text)  │         │  via chrome.scripting.  │
│   • tab.create(url)             │         │  executeScript          │
│   • tab.list()                  │         │                         │
└─────────────────────────────────┘         └─────────────────────────┘
                                                      ↓
                                            ┌─────────────────────────┐
                                            │ content script in tab   │
                                            │ (runs as page-world JS) │
                                            └─────────────────────────┘
```

## Required setup

Three files for the extension + one for the native messaging manifest.

### 1. Extension `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "OpenClaw Bridge",
  "version": "0.1.0",
  "description": "Lets the local OpenClaw daemon drive this browser session.",
  "permissions": ["scripting", "tabs", "activeTab", "nativeMessaging", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "icons": { "128": "icon.png" }
}
```

### 2. `background.js` — the bridge

```js
// background.js — runs as a Manifest V3 service worker.
// Holds a long-lived connection to the OpenClaw native host and forwards
// commands to whichever tab is targeted.

const HOST_NAME = "com.openclaw.bridge";
let port = chrome.runtime.connectNative(HOST_NAME);

port.onMessage.addListener(async (msg) => {
  // msg = { id, method, params: { tabId?, selector?, text?, url? } }
  try {
    const result = await dispatch(msg.method, msg.params);
    port.postMessage({ id: msg.id, result });
  } catch (err) {
    port.postMessage({ id: msg.id, error: { message: String(err?.message ?? err) } });
  }
});

port.onDisconnect.addListener(() => {
  // Auto-reconnect when daemon restarts.
  setTimeout(() => { port = chrome.runtime.connectNative(HOST_NAME); }, 2000);
});

async function dispatch(method, params) {
  const tabId = params.tabId ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  switch (method) {
    case "tab.list":
      return chrome.tabs.query({});
    case "tab.create":
      return chrome.tabs.create({ url: params.url });
    case "tab.activate":
      return chrome.tabs.update(tabId, { active: true });
    case "dom.click":
      return execInTab(tabId, (sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`selector not found: ${sel}`);
        el.scrollIntoView({ block: "center" });
        el.click();
        return { ok: true };
      }, [params.selector]);
    case "dom.fill":
      return execInTab(tabId, (sel, text) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`selector not found: ${sel}`);
        const proto = Object.getPrototypeOf(el);
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }, [params.selector, params.text]);
    case "dom.text":
      return execInTab(tabId, (sel) => {
        const el = document.querySelector(sel);
        return el?.textContent ?? null;
      }, [params.selector]);
    case "dom.html":
      return execInTab(tabId, () => document.documentElement.outerHTML);
    case "dom.evaluate":
      // eslint-disable-next-line no-new-func
      return execInTab(tabId, new Function("return (" + params.expression + ")"));
    default:
      throw new Error(`unknown method: ${method}`);
  }
}

async function execInTab(tabId, func, args = []) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",       // run in the page's JS context, not the isolated world
    func,
    args,
  });
  return result;
}
```

### 3. Native Messaging Host manifest

Path on macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.openclaw.bridge.json`

```json
{
  "name": "com.openclaw.bridge",
  "description": "OpenClaw daemon bridge for the Chrome extension",
  "path": "/Users/<you>/Developer/open/axl/mcp-servers/chrome-host.sh",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<EXTENSION_ID_GOES_HERE>/"
  ]
}
```

`chrome-host.sh` is a tiny shim that starts the Node MCP server with stdio attached:

```bash
#!/usr/bin/env bash
exec node /Users/<you>/Developer/open/axl/mcp-servers/chrome-host.js
```

`chmod +x chrome-host.sh`. The extension ID comes from `chrome://extensions` after loading the unpacked extension.

### 4. Native host (Node side)

```js
// axl/mcp-servers/chrome-host.js — reads length-prefixed JSON from stdin,
// writes length-prefixed JSON to stdout. This is Chrome's Native Messaging
// wire format.

process.stdin.on("readable", () => {
  let chunk;
  while ((chunk = process.stdin.read(4))) {
    const len = chunk.readUInt32LE(0);
    const payload = process.stdin.read(len);
    if (!payload) return;
    handleMessage(JSON.parse(payload.toString("utf8")));
  }
});

function send(obj) {
  const buf = Buffer.from(JSON.stringify(obj), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length, 0);
  process.stdout.write(Buffer.concat([len, buf]));
}

async function handleMessage(msg) {
  // msg from the extension. Forward to the AXL/MCP layer or handle directly.
  // For OpenClaw: re-emit on the agent's MCP channel so remote agents can call.
  // ... (wire to mcp-router.py via HTTP POST)
}
```

## Distribution

For the demo / dev: **load unpacked** at `chrome://extensions` (toggle Developer mode → Load unpacked → pick the extension dir). Capture the extension ID and paste into the Native Messaging manifest.

For prod: package and upload to the Chrome Web Store. Native Messaging hosts also work in unpacked-but-distributed-via-installer mode (Enterprise Chrome policies), useful for shipping with the OpenClaw connector binary.

## When to fall back

| failure signal | fall back to |
|---|---|
| User isn't on Chrome / extension not installed | `playwright` attach mode (CDP), then fresh-launch as last resort |
| Site uses Shadow DOM and `document.querySelector` returns null | Patch the executor to do `querySelector` with composed-tree traversal, or fall back to `playwright`'s `page.locator` (which handles shadow roots transparently) |
| User is on a tab outside the extension's `host_permissions` | Re-prompt for permission, or warn user and fall back to `playwright` |
| `executeScript` rejected (CSP, chrome:// URL) | These pages are restricted by Chrome — no library can script them. Surface to user. |

## Security

- The extension has `<all_urls>` host permissions. Make this explicit in the install dialog so the user understands the scope.
- Native Messaging Host path is absolute and per-machine — don't commit `chrome-host.sh` paths to the repo.
- Restrict `allowed_origins` in the host manifest to your specific extension ID. With the wildcard, **any** extension on the machine could talk to the daemon.
- The extension and the daemon should mutually authenticate on connection — generate a shared secret at install time, persist it in `chrome.storage.local`, include it in every message.

## Performance

- ~30ms per click (vs ~200ms Playwright, ~3000ms computer-use).
- `chrome.scripting.executeScript` runs synchronously in the page; no IPC roundtrip for the JS itself, only for the result.
- Long-lived `connectNative` connection — no per-call startup cost.

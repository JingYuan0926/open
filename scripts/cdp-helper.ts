// scripts/cdp-helper.ts — minimal Chrome DevTools Protocol client.
//
// Connects to Chrome launched with --remote-debugging-port=9222 and lets us
// navigate / click / wait without any Playwright dependency.
//
// WSL2 reaches Windows-side localhost transparently on Win11+, so this works
// from WSL even when Chrome runs on Windows.

import { setTimeout as sleep } from "node:timers/promises";

interface CDPPage {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

interface CDPMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: { result?: { value?: unknown }; [k: string]: unknown };
  error?: { code: number; message: string };
}

export class CDPSession {
  private ws!: WebSocket;
  private msgId = 0;
  private pending = new Map<number, (msg: CDPMessage) => void>();

  static async connect(port = 9222, retries = 30): Promise<CDPSession> {
    let pages: CDPPage[] | null = null;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`http://localhost:${port}/json/list`);
        if (res.ok) {
          pages = (await res.json()) as CDPPage[];
          break;
        }
      } catch {
        // Chrome not up yet
      }
      await sleep(500);
    }
    if (!pages) {
      throw new Error(`Couldn't reach Chrome debug port at localhost:${port}. Run: npm run chrome:debug`);
    }
    const page = pages.find((p) => p.type === "page");
    if (!page) throw new Error("No Chrome page found");

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("CDP WebSocket failed")), { once: true });
    });

    const session = new CDPSession();
    session.ws = ws;
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data as string) as CDPMessage;
      if (msg.id != null && session.pending.has(msg.id)) {
        session.pending.get(msg.id)!(msg);
        session.pending.delete(msg.id);
      }
    });
    // Enable Page domain so navigate works reliably
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    return session;
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<CDPMessage> {
    const id = ++this.msgId;
    return new Promise<CDPMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout for ${method}`));
      }, 30_000);
      this.pending.set(id, (msg) => {
        clearTimeout(timeout);
        if (msg.error) reject(new Error(`CDP ${method}: ${msg.error.message}`));
        else resolve(msg);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url: string, settleMs = 1500): Promise<void> {
    await this.send("Page.navigate", { url });
    // Crude but reliable: give the page time to load. CDP has Page.loadEventFired
    // but it's flaky for SPAs.
    await sleep(settleMs);
  }

  async evaluate<T = unknown>(expression: string): Promise<T | undefined> {
    const r = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    return r.result?.result?.value as T | undefined;
  }

  async click(selector: string): Promise<boolean> {
    const found = await this.evaluate<boolean>(`(function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    return found === true;
  }

  async waitForSelector(selector: string, timeoutMs = 10000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await this.evaluate<boolean>(
        `!!document.querySelector(${JSON.stringify(selector)})`
      );
      if (found === true) return true;
      await sleep(200);
    }
    return false;
  }

  /** Current URL of the active tab (after all redirects). */
  async getCurrentUrl(): Promise<string> {
    return (await this.evaluate<string>("window.location.href")) ?? "";
  }

  /** Full navigation history of this tab. Each entry has {id, url, title, transitionType}. */
  async getNavigationHistory(): Promise<Array<{ url: string; title: string }>> {
    const r = await this.send("Page.getNavigationHistory");
    const entries = (r.result?.entries as Array<{ url: string; title: string }>) ?? [];
    return entries;
  }

  close(): void {
    this.ws.close();
  }
}

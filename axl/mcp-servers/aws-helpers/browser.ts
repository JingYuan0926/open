// axl/mcp-servers/aws-helpers/browser.ts
//
// Cross-platform "open URL in Google Chrome" wrapper. (Defaults to Chrome
// because the demo wants a predictable browser; override with BROWSER=msedge
// or BROWSER=default.)
//
//   macOS         → open -a "Google Chrome" <url>
//   WSL / Win32   → cmd.exe /c start "" chrome <url>     (uses Windows App Paths registry)
//   Linux desktop → google-chrome <url>     (or xdg-open if BROWSER=default)
//
// On Windows, `start "" chrome <url>` works because Chrome's installer
// registers an App Paths entry — Windows resolves "chrome" → chrome.exe even
// without a full path. If Chrome isn't installed, we fall back to the system
// default browser by setting BROWSER=default.
//
// Uses spawn() with array args (no shell), so URL special chars (& ! etc.)
// don't need escaping.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { platform } from "node:os";

function isWSL(): boolean {
  if (platform() !== "linux") return false;
  try {
    const ver = readFileSync("/proc/version", "utf8").toLowerCase();
    return ver.includes("microsoft") || ver.includes("wsl");
  } catch {
    return false;
  }
}

export interface Opener {
  cmd: string;
  args: (url: string) => string[];
  description: string;
}

export function detectOpener(): Opener {
  const browser = process.env.BROWSER ?? "chrome";
  const useDefault = browser === "default";
  const p = platform();

  if (p === "darwin") {
    if (useDefault) return { cmd: "open", args: (u) => [u], description: "open (macOS default)" };
    const appName = browser === "chrome" ? "Google Chrome" : browser;
    return { cmd: "open", args: (u) => ["-a", appName, u], description: `open -a "${appName}"` };
  }

  if (p === "win32" || isWSL()) {
    if (useDefault) return { cmd: "cmd.exe", args: (u) => ["/c", "start", "", u], description: "cmd.exe /c start (default)" };
    // `start "" <browser> <url>` — Windows App Paths registry resolves the
    // browser name to its .exe path. Chrome / msedge / firefox / brave all
    // register App Paths on install.
    return { cmd: "cmd.exe", args: (u) => ["/c", "start", "", browser, u], description: `cmd.exe /c start "" ${browser}` };
  }

  // Linux desktop
  if (useDefault) return { cmd: "xdg-open", args: (u) => [u], description: "xdg-open" };
  const linuxName = browser === "chrome" ? "google-chrome" : browser;
  return { cmd: linuxName, args: (u) => [u], description: linuxName };
}

export async function openUrl(url: string): Promise<void> {
  const opener = detectOpener();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(opener.cmd, opener.args(url), {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", reject);
    child.on("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

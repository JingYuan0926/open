// axl/mcp-servers/aws-helpers/browser.ts
//
// Cross-platform "open URL in default browser" wrapper.
//   macOS         → `open <url>`
//   WSL           → `cmd.exe /c start "" <url>`     (Windows host's default browser)
//   Windows       → `cmd.exe /c start "" <url>`
//   Linux desktop → `xdg-open <url>`
//
// Uses spawn() with array args (no shell), so URL special chars (& ! etc.)
// don't need escaping for the shell. The child is detached + unref'd so we
// don't block on the browser process.

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

export function detectOpener(): { cmd: string; args: (url: string) => string[] } {
  const p = platform();
  if (p === "darwin") {
    return { cmd: "open", args: (u) => [u] };
  }
  if (p === "win32") {
    return { cmd: "cmd.exe", args: (u) => ["/c", "start", "", u] };
  }
  if (isWSL()) {
    return { cmd: "cmd.exe", args: (u) => ["/c", "start", "", u] };
  }
  return { cmd: "xdg-open", args: (u) => [u] };
}

export async function openUrl(url: string): Promise<void> {
  const { cmd, args } = detectOpener();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args(url), { stdio: "ignore", detached: true });
    child.on("error", reject);
    child.on("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

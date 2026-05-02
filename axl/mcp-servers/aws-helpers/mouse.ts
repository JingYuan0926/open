// axl/mcp-servers/aws-helpers/mouse.ts
//
// Drive the host OS's mouse cursor from a script. Used by the demo to make
// MCP tool execution look "AI-like" — cursor smoothly glides to a button,
// pauses, optionally clicks. Coordinates are caller-supplied.
//
// Implementation: PowerShell on Windows / WSL (move_mouse.ps1).
// macOS support deferred — install `cliclick` (brew install cliclick) and we'll
// add a parallel branch.

import { spawn, execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { platform } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function isWSL(): boolean {
  if (platform() !== "linux") return false;
  try {
    const ver = readFileSync("/proc/version", "utf8").toLowerCase();
    return ver.includes("microsoft") || ver.includes("wsl");
  } catch {
    return false;
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PS_SCRIPT_LINUX = resolve(HERE, "move_mouse.ps1");

let cachedWindowsPath: string | undefined;
function powershellPath(): string {
  if (cachedWindowsPath) return cachedWindowsPath;
  // wslpath -w '/home/x/y/z.ps1' → '\\wsl.localhost\Ubuntu\home\x\y\z.ps1'
  const out = execSync(`wslpath -w "${PS_SCRIPT_LINUX}"`).toString().trim();
  cachedWindowsPath = out;
  return out;
}

export interface MouseMoveOptions {
  // Omit fromX/fromY to start the glide from the cursor's current position
  // (no teleport). Pass them explicitly only if you want a fixed start.
  fromX?: number;
  fromY?: number;
  toX: number;
  toY: number;
  durationMs?: number;
  click?: boolean;
}

export async function moveMouse(opts: MouseMoveOptions): Promise<void> {
  const p = platform();

  if (p !== "win32" && !isWSL()) {
    // macOS / Linux desktop — silently no-op for now. Demo still works,
    // just without the cursor flair. Install cliclick (mac) or xdotool (linux)
    // and we can wire those up.
    console.log(`[mouse] (skipped — host OS '${p}' not supported yet; install cliclick on macOS to enable)`);
    return;
  }

  const args = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", powershellPath(),
    "-ToX", String(opts.toX),
    "-ToY", String(opts.toY),
    "-DurationMs", String(opts.durationMs ?? 1200),
    ...(opts.fromX !== undefined ? ["-FromX", String(opts.fromX)] : []),
    ...(opts.fromY !== undefined ? ["-FromY", String(opts.fromY)] : []),
    ...(opts.click ? ["-Click"] : []),
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("powershell.exe", args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`powershell exited with code ${code}`));
    });
  });
}

export interface ScreenSize { width: number; height: number; }

export interface CursorPosition { x: number; y: number; }

export function getCursorPosition(): CursorPosition {
  if (platform() !== "win32" && !isWSL()) {
    return { x: 0, y: 0 };
  }
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    'Add-Type -AssemblyName System.Windows.Forms; $p = [System.Windows.Forms.Cursor]::Position; Write-Host ("{0},{1}" -f $p.X, $p.Y)',
  ]);
  const out = result.stdout?.toString().trim() ?? "";
  const m = out.match(/(\d+),(\d+)/);
  if (!m) return { x: 0, y: 0 };
  return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
}

export async function getScreenSize(): Promise<ScreenSize> {
  if (platform() !== "win32" && !isWSL()) {
    return { width: 1920, height: 1080 };
  }
  // spawnSync (no shell) — avoids sh interpolating PowerShell's $vars.
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    'Add-Type -AssemblyName System.Windows.Forms; $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Host ("{0}x{1}" -f $s.Width, $s.Height)',
  ]);
  const out = result.stdout?.toString().trim() ?? "";
  const m = out.match(/(\d+)x(\d+)/);
  if (!m) throw new Error(`unexpected screen-size output: ${out || result.stderr?.toString() || "(empty)"}`);
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

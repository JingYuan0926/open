// axl/mcp-servers/aws-helpers/browser.ts
//
// One-line wrapper around macOS `open` to launch a URL in the user's default browser.
// Phase 1 / Phase 2 are macOS-only — port to xdg-open / start when porting to Linux/Windows.

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

export async function openUrl(url: string): Promise<void> {
  const escaped = url.replace(/"/g, '\\"');
  await execP(`open "${escaped}"`);
}

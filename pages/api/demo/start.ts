import type { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openUrl } from "../../../axl/mcp-servers/aws-helpers/browser";

export const DEMO_DONE_MARKER = join(tmpdir(), "openclaw-demo-done.flag");

// POST /api/demo/start
// One-shot kickoff: clears any stale completion marker, opens the AWS sign-in
// page, and spawns `npm run demo:final` detached. The user signs in on their
// own pace; demo:final's browser walk + Terminal.app popup runs in parallel.
// The UI polls /api/demo/status to know when the popup install completes
// (demo:cli-aws writes DEMO_DONE_MARKER at the end of step 7).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    // Clear stale marker from any previous run.
    try { rmSync(DEMO_DONE_MARKER, { force: true }); } catch {}

    // Open AWS sign-in pages immediately (theatrical + lets user start logging in).
    await openUrl("https://aws.amazon.com/free/");
    setTimeout(() => {
      openUrl("https://signin.aws.amazon.com/console").catch(() => {});
    }, 1500);

    // Spawn demo:final detached. Parent exits in ~25s (does its own browser
    // walk + osascript for Terminal.app); the popup terminal continues.
    const child = spawn("npm", ["run", "demo:final"], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: { ...process.env, OPENCLAW_DEMO_MARKER: DEMO_DONE_MARKER },
    });
    child.unref();

    res.status(200).json({ ok: true, pid: child.pid, marker: DEMO_DONE_MARKER });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}

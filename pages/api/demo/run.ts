import type { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "node:child_process";

// POST /api/demo/run
// Spawns `npm run demo:final` detached. The parent process exits in ~25s
// (browser walk through 3 EC2 console pages, then osascript spawns Terminal.app
// running demo:cli-aws). The popup terminal continues independently.
//
// We return immediately so the UI can advance to the "running" state without
// blocking on the parent's lifetime.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    const child = spawn("npm", ["run", "demo:final"], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
    res.status(200).json({ ok: true, pid: child.pid });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}

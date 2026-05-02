import type { NextApiRequest, NextApiResponse } from "next";
import { existsSync } from "node:fs";
import { DEMO_DONE_MARKER } from "./start";

// GET /api/demo/status — returns { done: boolean }.
// done = true once demo-cli-aws.ts (running in the popup terminal) has written
// the marker file at the end of its install. UI polls this every few seconds.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ done: existsSync(DEMO_DONE_MARKER), marker: DEMO_DONE_MARKER });
}

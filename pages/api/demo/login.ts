import type { NextApiRequest, NextApiResponse } from "next";
import { openUrl } from "../../../axl/mcp-servers/aws-helpers/browser";

// POST /api/demo/login
// Opens the AWS landing + sign-in pages in the user's default browser.
// This replaces what `demo:before` does up until the "press Enter when signed in"
// pause — the UI handles that pause as a modal instead.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    await openUrl("https://aws.amazon.com/free/");
    setTimeout(() => {
      openUrl("https://signin.aws.amazon.com/console").catch(() => {});
    }, 1500);
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}

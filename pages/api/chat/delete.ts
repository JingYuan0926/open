import type { NextApiRequest, NextApiResponse } from "next";
import { deleteChatSession } from "@/lib/chat-storage";

type Body = { sessionId?: string; walletAddress?: string };

type Ok = { ok: true };
type Err = { ok: false; error: string };

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>,
) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const { sessionId, walletAddress } = req.body as Body;
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ ok: false, error: "sessionId is required" });
  }
  if (!walletAddress || typeof walletAddress !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "walletAddress is required" });
  }

  try {
    const removed = deleteChatSession(sessionId, walletAddress);
    if (!removed) {
      return res
        .status(404)
        .json({ ok: false, error: "Session not found for this wallet" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

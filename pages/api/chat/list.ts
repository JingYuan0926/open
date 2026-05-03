import type { NextApiRequest, NextApiResponse } from "next";
import { listChatSessions, type ChatSession } from "@/lib/chat-storage";

type Ok = { ok: true; sessions: ChatSession[] };
type Err = { ok: false; error: string };

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const { walletAddress } = req.query;
  if (!walletAddress || typeof walletAddress !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "walletAddress query param is required" });
  }

  try {
    const sessions = listChatSessions(walletAddress);
    return res.status(200).json({ ok: true, sessions });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

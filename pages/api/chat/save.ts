import type { NextApiRequest, NextApiResponse } from "next";
import {
  saveChatSession,
  type ChatMessage,
  type ChatSession,
} from "@/lib/chat-storage";

type Body = {
  walletAddress?: string;
  messages?: ChatMessage[];
  sessionId?: string;
  filename?: string;
};

type Ok = { ok: true; session: ChatSession };
type Err = { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const { walletAddress, messages, sessionId, filename } = req.body as Body;

  if (!walletAddress || typeof walletAddress !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "walletAddress is required" });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res
      .status(400)
      .json({ ok: false, error: "messages must be a non-empty array" });
  }

  try {
    const session = await saveChatSession({
      walletAddress,
      messages,
      sessionId,
      filename,
    });
    return res.status(200).json({ ok: true, session });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

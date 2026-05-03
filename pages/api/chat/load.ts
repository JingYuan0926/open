import type { NextApiRequest, NextApiResponse } from "next";
import { loadChatMessages, type ChatMessage } from "@/lib/chat-storage";

type Ok = { ok: true; messages: ChatMessage[] };
type Err = { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const { rootHash } = req.query;
  if (!rootHash || typeof rootHash !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "rootHash query param is required" });
  }

  try {
    const messages = await loadChatMessages(rootHash);
    return res.status(200).json({ ok: true, messages });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

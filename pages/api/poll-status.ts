import type { NextApiRequest, NextApiResponse } from "next";
import { axlRecv } from "@/axl/axl";
import type { A2ATaskResponse } from "@/axl/a2a";

const NODE1_PORT = parseInt(process.env.NODE1_API_PORT ?? "9002");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const msg = await axlRecv(NODE1_PORT);
  if (!msg) {
    return res.json({ status: "pending" });
  }

  try {
    const parsed: A2ATaskResponse = JSON.parse(msg.body);

    if (parsed.jsonrpc === "2.0" && parsed.result) {
      const { state, message } = parsed.result.status;
      const artifact = parsed.result.artifacts?.[0]?.parts?.[0]?.text;

      if (state === "completed") {
        return res.json({
          status: "delivered",
          taskId: parsed.result.id,
          fromPeer: msg.fromPeerId,
          detail: artifact ?? "Email delivered",
        });
      }

      if (state === "failed") {
        return res.json({
          status: "failed",
          taskId: parsed.result.id,
          error: message ?? "Unknown error",
        });
      }

      if (state === "working") {
        return res.json({
          status: "working",
          taskId: parsed.result.id,
          detail: message ?? "Agent is processing...",
        });
      }
    }
  } catch {
    // non-JSON or unknown message
  }

  return res.json({ status: "pending" });
}

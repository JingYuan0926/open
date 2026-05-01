import { NextResponse } from "next/server";
import { axlRecv } from "@/lib/axl";
import type { A2ATaskResponse } from "@/lib/a2a";

const NODE1_PORT = parseInt(process.env.NODE1_API_PORT ?? "9002");

export async function GET() {
  const msg = await axlRecv(NODE1_PORT);
  if (!msg) {
    return NextResponse.json({ status: "pending" });
  }

  try {
    const parsed: A2ATaskResponse = JSON.parse(msg.body);

    if (parsed.jsonrpc === "2.0" && parsed.result) {
      const { state, message } = parsed.result.status;
      const artifact = parsed.result.artifacts?.[0]?.parts?.[0]?.text;

      if (state === "completed") {
        return NextResponse.json({
          status: "delivered",
          taskId: parsed.result.id,
          fromPeer: msg.fromPeerId,
          detail: artifact ?? "Email delivered",
        });
      }

      if (state === "failed") {
        return NextResponse.json({
          status: "failed",
          taskId: parsed.result.id,
          error: message ?? "Unknown error",
        });
      }

      if (state === "working") {
        return NextResponse.json({
          status: "working",
          taskId: parsed.result.id,
          detail: message ?? "Agent is processing...",
        });
      }
    }
  } catch {
    // non-JSON or unknown message
  }

  return NextResponse.json({ status: "pending" });
}

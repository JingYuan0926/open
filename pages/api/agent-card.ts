import type { NextApiRequest, NextApiResponse } from "next";
import type { A2AAgentCard } from "@/axl/a2a";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const card: A2AAgentCard = {
    name: "AXL Email Bridge Agent",
    description:
      "Receives email tasks over Gensyn's AXL encrypted P2P mesh and delivers them via Gmail. Uses MCP to invoke the send_email tool.",
    url: "http://localhost:3000",
    version: "1.0.0",
    capabilities: { tasks: {} },
    skills: [
      {
        id: "send_email",
        name: "Send Email",
        description: "Deliver an email to a recipient via Gmail SMTP",
        inputModes: ["data"],
        outputModes: ["text"],
      },
    ],
  };

  res.json(card);
}

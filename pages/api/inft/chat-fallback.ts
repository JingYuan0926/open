import type { NextApiRequest, NextApiResponse } from "next";

const OPENAI_URL =
  process.env.AI_INFERENCE_URL || "https://api.openai.com/v1/chat/completions";
const OPENAI_KEY = process.env.AI_INFERENCE_KEY || "";
const MODEL = process.env.AI_INFERENCE_MODEL || "gpt-4o-mini";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  if (!OPENAI_KEY) {
    return res
      .status(500)
      .json({ error: "AI_INFERENCE_KEY not configured in .env" });
  }

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful AI agent on the 0G platform. You assist with DeFi analytics, on-chain data, and agent coordination. Keep responses concise.",
          },
          { role: "user", content: message },
        ],
        max_tokens: 512,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res
        .status(500)
        .json({ success: false, error: data.error?.message || "OpenAI error" });
    }

    const text =
      data.choices?.[0]?.message?.content || "No response generated.";
    return res.json({ success: true, response: text, fallback: true });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: String(err) });
  }
}

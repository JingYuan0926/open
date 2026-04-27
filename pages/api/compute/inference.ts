import type { NextApiRequest, NextApiResponse } from "next";
import { getComputeBroker } from "@/lib/0g-compute";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { provider: providerAddress, message } = req.body;

  if (!providerAddress || !message) {
    return res.status(400).json({ error: "provider and message are required" });
  }

  try {
    const broker = await getComputeBroker();

    // 1. Acknowledge provider if not already done
    const acked = await broker.inference.acknowledged(providerAddress);
    if (!acked) {
      await broker.inference.acknowledgeProviderSigner(providerAddress);
    }

    // 2. Get service metadata (endpoint + model)
    const { endpoint, model } = await broker.inference.getServiceMetadata(
      providerAddress
    );

    // 3. Get auth headers
    const headers = await broker.inference.getRequestHeaders(
      providerAddress,
      message
    );

    // 4. Call the AI (OpenAI-compatible)
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: message }],
        max_tokens: 512,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({
        success: false,
        error: `Provider returned ${response.status}: ${errText}`,
      });
    }

    const completion = await response.json();

    // 5. Process response (verify + cache fees)
    const chatID =
      response.headers.get("ZG-Res-Key") || completion.id || undefined;
    const usageStr = completion.usage
      ? JSON.stringify(completion.usage)
      : undefined;

    let verified: boolean | null = null;
    try {
      verified = await broker.inference.processResponse(
        providerAddress,
        chatID,
        usageStr
      );
    } catch {
      // verification may fail on some providers, non-critical
    }

    const reply =
      completion.choices?.[0]?.message?.content || "No response content";

    return res.status(200).json({
      success: true,
      provider: providerAddress,
      model,
      endpoint,
      response: reply,
      chatID,
      verified,
      usage: completion.usage || null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

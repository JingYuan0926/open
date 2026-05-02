import type { NextApiRequest, NextApiResponse } from "next";
import { getComputeBroker } from "@/lib/0g-compute";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const broker = await getComputeBroker();
    const services = await broker.inference.listService(0, 50, true);

    const formatted = services.map((s) => ({
      provider: s.provider,
      model: s.model,
      serviceType: s.serviceType,
      url: s.url,
      inputPrice: s.inputPrice.toString(),
      outputPrice: s.outputPrice.toString(),
      verifiability: s.verifiability,
    }));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      services: formatted,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

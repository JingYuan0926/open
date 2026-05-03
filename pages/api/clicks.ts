import type { NextApiRequest, NextApiResponse } from "next";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const HASH_KEY = "wallet_clicks";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const wallets = (await redis.hgetall<Record<string, string>>(HASH_KEY)) ?? {};
    return res.json({ wallets });
  }

  if (req.method === "POST") {
    const address = typeof req.body?.address === "string" ? req.body.address : "";
    if (!ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    const normalized = address.toLowerCase();
    const count = await redis.hincrby(HASH_KEY, normalized, 1);
    return res.json({ address: normalized, count });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

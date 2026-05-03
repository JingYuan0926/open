import type { NextApiRequest, NextApiResponse } from "next";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const KEY = "clicks";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const count = (await redis.get<number>(KEY)) ?? 0;
    return res.json({ count });
  }

  if (req.method === "POST") {
    const count = await redis.incr(KEY);
    return res.json({ count });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

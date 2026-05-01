import type { NextApiRequest, NextApiResponse } from "next";
import { getTopology } from "@/axl/axl";

const NODE1_PORT = parseInt(process.env.NODE1_API_PORT ?? "9002");
const NODE2_PORT = parseInt(process.env.NODE2_API_PORT ?? "9003");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const [node1, node2] = await Promise.allSettled([
    getTopology(NODE1_PORT),
    getTopology(NODE2_PORT),
  ]);

  res.json({
    node1: node1.status === "fulfilled" ? node1.value : null,
    node2: node2.status === "fulfilled" ? node2.value : null,
  });
}

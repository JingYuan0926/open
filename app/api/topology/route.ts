import { NextResponse } from "next/server";
import { getTopology } from "@/lib/axl";

const NODE1_PORT = parseInt(process.env.NODE1_API_PORT ?? "9002");
const NODE2_PORT = parseInt(process.env.NODE2_API_PORT ?? "9003");

export async function GET() {
  const [node1, node2] = await Promise.allSettled([
    getTopology(NODE1_PORT),
    getTopology(NODE2_PORT),
  ]);

  return NextResponse.json({
    node1: node1.status === "fulfilled" ? node1.value : null,
    node2: node2.status === "fulfilled" ? node2.value : null,
  });
}

import type { NextApiRequest, NextApiResponse } from "next";

// Gated by /proxy.ts via x402. By the time control reaches this handler,
// the facilitator at https://x402.org/facilitator has already verified the
// EIP-3009 USDC authorization signed by the caller and settled it on Base
// Sepolia. The body is just a stand-in resource for the demo.

export default function handler(
    _req: NextApiRequest,
    res: NextApiResponse,
) {
    res.json({
        timestamp: new Date().toISOString(),
        protocol: "x402",
        network: "eip155:84532",
        message:
            "Payment confirmed. You're inside the gated handler — this body would be the real resource (e.g. ENS specialist data, oracle feed, etc.).",
        nonce: Math.floor(Math.random() * 1_000_000),
    });
}

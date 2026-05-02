import { paymentProxy, x402ResourceServer } from "@x402/next";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/http";

// x402 payment proxy. Gates GET /api/x402/news with a 0.01 USDC charge on
// Base Sepolia. The first request gets HTTP 402 + payment requirements; the
// client signs an EIP-3009 transferWithAuthorization off-chain and resubmits
// via the PAYMENT-SIGNATURE header. The Coinbase-hosted facilitator at
// https://x402.org/facilitator does the on-chain settle via USDC's
// `transferWithAuthorization`. Once settled, the request is forwarded to
// the underlying handler at pages/api/x402/news.ts.
//
// In Next.js 16 the file convention is `proxy.ts` (renamed from middleware).

const facilitator = new HTTPFacilitatorClient({
    url: "https://x402.org/facilitator",
});

const server = new x402ResourceServer(facilitator).register(
    "eip155:84532",
    new ExactEvmScheme(),
);

// Payout receiver. Default is vitalik.eth (well-known mainnet address that
// also receives testnet dust) — picked so it's *not* the address derived
// from this repo's 0G_PRIVATE_KEY (which happens to match DIVE's demo
// payee). Override via X402_PAY_TO=0x… for a real recipient.
const PAY_TO = (process.env.X402_PAY_TO ||
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045") as `0x${string}`;

export const proxy = paymentProxy(
    {
        "GET /api/x402/news": {
            accepts: {
                scheme: "exact",
                network: "eip155:84532",
                payTo: PAY_TO,
                price: "$0.01",
            },
            description:
                "x402 demo — pay 0.01 USDC on Base Sepolia to read this resource",
        },
    },
    server,
);

export const config = {
    matcher: ["/api/x402/news"],
};

import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";

// x402-protocol-shaped endpoint. Settles in NATIVE 0G on Galileo testnet
// (chainId 16602) using `0G_PRIVATE_KEY` from the server env.
//
// Two-stage flow per the x402 spec:
//   1. POST without `X-PAYMENT` header  →  HTTP 402 + paymentRequirements JSON
//   2. POST with `X-PAYMENT` header     →  server pushes the on-chain transfer,
//                                          returns 200 + tx hash + explorer URL
//
// Why a custom `native` scheme instead of the canonical `exact` scheme:
// `exact` requires EIP-3009 transferWithAuthorization, which only USDC and
// similar tokens implement — 0G's native token doesn't. So we register a
// custom `native` scheme on network `0g-galileo-testnet`. The server
// (holding `0G_PRIVATE_KEY`) acts as both facilitator and payer; the
// `X-PAYMENT` header is a base64-encoded JSON the UI submits to confirm
// intent and bind the request body to the requirements returned in step 1.

const ZG_RPC = "https://evmrpc-testnet.0g.ai";
const ZG_CHAIN_ID = 16602;
const NETWORK = "0g-galileo-testnet";
const SCHEME = "native";
const NATIVE_ASSET = "0x0000000000000000000000000000000000000000";
const X402_VERSION = 1;

type PayBody = {
    agentName: string;
    ownerAddress: string;
    priceOG: string;
};

type PaymentPayload = {
    x402Version: number;
    scheme: string;
    network: string;
    payload: {
        confirm: boolean;
        payTo: string;
        amount: string;
        agentName: string;
    };
};

function isAddress(s: string) {
    return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function isPositiveDecimal(s: string) {
    return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s) && Number(s) > 0;
}

function decodePayment(header: string): PaymentPayload | null {
    try {
        const json = Buffer.from(header, "base64").toString("utf8");
        const parsed = JSON.parse(json);
        if (parsed.x402Version !== X402_VERSION) return null;
        if (parsed.scheme !== SCHEME) return null;
        if (parsed.network !== NETWORK) return null;
        if (!parsed.payload || parsed.payload.confirm !== true) return null;
        return parsed as PaymentPayload;
    } catch {
        return null;
    }
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "POST only" });
    }

    const body = req.body as Partial<PayBody>;
    const { agentName, ownerAddress, priceOG } = body;

    if (!agentName || !ownerAddress || !priceOG) {
        return res.status(400).json({
            error: "Missing required fields: agentName, ownerAddress, priceOG",
        });
    }
    if (!isAddress(ownerAddress)) {
        return res.status(400).json({ error: "Invalid ownerAddress" });
    }
    if (!isPositiveDecimal(priceOG)) {
        return res
            .status(400)
            .json({ error: "Invalid priceOG (must be positive decimal)" });
    }

    const amountWei = ethers.parseUnits(priceOG, 18).toString();
    const proto =
        (req.headers["x-forwarded-proto"] as string) ||
        (req.headers.host?.startsWith("localhost") ? "http" : "https");
    const resource = `${proto}://${req.headers.host}/api/x402/pay-agent`;

    // ── Step 1: no X-PAYMENT header → 402 with payment requirements ─────
    const paymentHeader = req.headers["x-payment"] as string | undefined;

    if (!paymentHeader) {
        return res.status(402).json({
            x402Version: X402_VERSION,
            accepts: [
                {
                    scheme: SCHEME,
                    network: NETWORK,
                    maxAmountRequired: amountWei,
                    resource,
                    description: `Per-call payment to ${agentName}`,
                    mimeType: "application/json",
                    payTo: ownerAddress,
                    maxTimeoutSeconds: 300,
                    asset: NATIVE_ASSET,
                    extra: {
                        chainId: ZG_CHAIN_ID,
                        agentName,
                        humanReadableAmount: `${priceOG} 0G`,
                    },
                },
            ],
            error: "Payment Required",
        });
    }

    // ── Step 2: X-PAYMENT header present → verify + settle on chain ─────
    const payment = decodePayment(paymentHeader);
    if (!payment) {
        return res.status(400).json({
            error: "Invalid X-PAYMENT header (expected base64 JSON x402 payload)",
        });
    }

    if (
        payment.payload.payTo.toLowerCase() !== ownerAddress.toLowerCase() ||
        payment.payload.amount !== amountWei ||
        payment.payload.agentName !== agentName
    ) {
        return res.status(400).json({
            error: "X-PAYMENT payload does not match request body",
        });
    }

    const privateKey = process.env["0G_PRIVATE_KEY"];
    if (!privateKey || privateKey === "YOUR_PRIVATE_KEY_HERE") {
        return res
            .status(500)
            .json({ error: "0G_PRIVATE_KEY not configured in .env" });
    }

    try {
        const provider = new ethers.JsonRpcProvider(ZG_RPC);
        const signer = new ethers.Wallet(privateKey, provider);

        if (signer.address.toLowerCase() === ownerAddress.toLowerCase()) {
            return res.status(400).json({
                error:
                    "Payer and recipient are the same address. Self-pay refused " +
                    "— register the agent under a different wallet to demo.",
                payerAddress: signer.address,
            });
        }

        const tx = await signer.sendTransaction({
            to: ownerAddress,
            value: ethers.parseUnits(priceOG, 18),
        });
        const receipt = await tx.wait();
        if (!receipt) {
            return res
                .status(500)
                .json({ error: "No receipt from 0G RPC", txHash: tx.hash });
        }

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            from: signer.address,
            payTo: ownerAddress,
            amount: priceOG,
            network: NETWORK,
            chainId: ZG_CHAIN_ID,
            explorerUrl: `https://chainscan-galileo.0g.ai/tx/${tx.hash}`,
            blockNumber: receipt.blockNumber,
        });
    } catch (err: unknown) {
        return res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

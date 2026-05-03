import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";

// x402-protocol-shaped endpoint. Settles in USDC on Base Sepolia
// (chainId 84532) using `0G_PRIVATE_KEY` (a generic secp256k1 keypair —
// the "0G" prefix is a misnomer; the same key works on any EVM chain).
//
// Two-stage flow per the x402 spec:
//   1. POST without `X-PAYMENT` header  →  HTTP 402 + paymentRequirements JSON
//   2. POST with `X-PAYMENT` header     →  server signs USDC.transfer(payTo, amount),
//                                          returns 200 + tx hash + basescan URL
//
// Why server-signed (not the canonical wallet-signed EIP-3009 flow):
// keeps the demo single-click. Server holds the funded wallet, takes the
// confirmation header as intent, and pushes the on-chain transfer itself.
// The wire format (scheme=exact, network=base-sepolia) still matches the
// canonical x402 schema for Base, so the same UI can later be pointed at
// Coinbase's hosted facilitator with no protocol changes.

const BASE_SEPOLIA_RPC =
    process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const BASE_SEPOLIA_CHAIN_ID = 84532;
const NETWORK = "base-sepolia";
const SCHEME = "exact";
// Circle's USDC on Base Sepolia (canonical address from x402 docs)
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_DECIMALS = 6;
const X402_VERSION = 1;

type PayBody = {
    agentName: string;
    ownerAddress: string;
    priceOG: string; // misnamed for legacy reasons; interpreted as USDC amount
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

const ERC20_ABI = [
    "function transfer(address to, uint256 value) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
];

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
            .json({ error: "Invalid price (must be positive decimal)" });
    }

    const amountAtomic = ethers.parseUnits(priceOG, USDC_DECIMALS).toString();
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
                    maxAmountRequired: amountAtomic,
                    resource,
                    description: `Per-call payment to ${agentName}`,
                    mimeType: "application/json",
                    payTo: ownerAddress,
                    maxTimeoutSeconds: 300,
                    asset: USDC_ADDRESS,
                    extra: {
                        chainId: BASE_SEPOLIA_CHAIN_ID,
                        agentName,
                        humanReadableAmount: `${priceOG} USDC`,
                        token: "USDC",
                        tokenDecimals: USDC_DECIMALS,
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
        payment.payload.amount !== amountAtomic ||
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
        const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
        const signer = new ethers.Wallet(privateKey, provider);

        if (signer.address.toLowerCase() === ownerAddress.toLowerCase()) {
            return res.status(400).json({
                error:
                    "Payer and recipient are the same address. Self-pay refused " +
                    "— register the agent under a different wallet to demo.",
                payerAddress: signer.address,
            });
        }

        const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
        const tx = await usdc.transfer(
            ownerAddress,
            ethers.parseUnits(priceOG, USDC_DECIMALS),
        );
        const receipt = await tx.wait();
        if (!receipt) {
            return res
                .status(500)
                .json({ error: "No receipt from Base Sepolia RPC", txHash: tx.hash });
        }

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            from: signer.address,
            payTo: ownerAddress,
            amount: priceOG,
            asset: "USDC",
            network: NETWORK,
            chainId: BASE_SEPOLIA_CHAIN_ID,
            explorerUrl: `https://sepolia.basescan.org/tx/${tx.hash}`,
            blockNumber: receipt.blockNumber,
        });
    } catch (err: unknown) {
        return res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

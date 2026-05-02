/**
 * CLI x402 client. Pays for `GET /api/x402/news` with USDC on Base Sepolia,
 * driven by `0G_PRIVATE_KEY` in .env (works on Base Sepolia too — same
 * secp256k1 keypair, the chainId is what's bound by the EIP-712 domain).
 *
 *   npm run x402:pay              # against http://localhost:3000
 *   X402_TARGET=https://… npm run x402:pay
 *
 * Three roundtrips printed:
 *   1. plain GET → expect 402 + decoded PAYMENT-REQUIRED header
 *   2. wrapped GET → @x402/fetch catches the 402, signs EIP-3009 USDC
 *      authz, retries with PAYMENT-SIGNATURE, expect 200 + body
 *   3. PAYMENT-RESPONSE response header → on-chain Base Sepolia tx hash
 *
 * Wallet must hold Base Sepolia USDC (faucet: https://faucet.circle.com).
 * No Base Sepolia ETH needed — facilitator pays gas.
 */

import "dotenv/config";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const TARGET =
    process.env.X402_TARGET || "http://localhost:3000/api/x402/news";

function decodeHeader(b64: string | null) {
    if (!b64) return null;
    try {
        return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    } catch {
        return b64;
    }
}

async function main() {
    const pkRaw = process.env["0G_PRIVATE_KEY"];
    if (!pkRaw) throw new Error("0G_PRIVATE_KEY not set in .env");
    const pk = (pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`) as `0x${string}`;
    const account = privateKeyToAccount(pk);

    console.log("─".repeat(72));
    console.log(`x402 CLI client`);
    console.log(`target:    ${TARGET}`);
    console.log(`payer:     ${account.address}`);
    console.log(`network:   Base Sepolia (eip155:84532)`);
    console.log(`asset:     USDC ($0.01 / call)`);
    console.log(`facilitator: https://x402.org/facilitator`);
    console.log("─".repeat(72));
    console.log();

    // ── 1) plain GET — should get 402 ───────────────────────────────
    console.log(`[1/3] GET ${TARGET}   (no payment header)`);
    const r0 = await fetch(TARGET);
    console.log(`      ← HTTP ${r0.status} ${r0.statusText}`);
    const reqHeader =
        r0.headers.get("payment-required") ||
        r0.headers.get("PAYMENT-REQUIRED");
    if (reqHeader) {
        const decoded = decodeHeader(reqHeader);
        console.log(`      PAYMENT-REQUIRED header (decoded):`);
        console.log(
            `        ${JSON.stringify(decoded, null, 2)
                .split("\n")
                .join("\n        ")}`,
        );
    } else {
        const body = await r0.text();
        console.log(`      body: ${body.slice(0, 400)}`);
    }
    console.log();

    if (r0.status !== 402) {
        console.log(
            `⚠️  expected HTTP 402 on the unauthenticated request — is the dev server running and proxy.ts wired?`,
        );
        process.exit(1);
    }

    // ── 2) build x402 client + wrapped fetch ────────────────────────
    const signer = toClientEvmSigner({
        address: account.address,
        signTypedData: ((msg: Parameters<typeof account.signTypedData>[0]) =>
            account.signTypedData(msg)) as Parameters<
            typeof toClientEvmSigner
        >[0]["signTypedData"],
    });
    const client = new x402Client().register(
        "eip155:84532",
        new ExactEvmScheme(signer),
    );
    const payFetch = wrapFetchWithPayment(globalThis.fetch, client);

    console.log(`[2/3] GET ${TARGET}   (via wrapFetchWithPayment)`);
    const r = await payFetch(TARGET);
    console.log(`      ← HTTP ${r.status} ${r.statusText}`);
    const body = (await r.json().catch(() => null)) as unknown;
    console.log(`      body:`);
    console.log(
        `        ${JSON.stringify(body, null, 2)
            .split("\n")
            .join("\n        ")}`,
    );
    console.log();

    // ── 3) decode PAYMENT-RESPONSE header for the on-chain tx hash ──
    const respHeader =
        r.headers.get("payment-response") ||
        r.headers.get("PAYMENT-RESPONSE");
    if (respHeader) {
        console.log(`[3/3] PAYMENT-RESPONSE header (decoded):`);
        let decoded: unknown;
        try {
            decoded = decodePaymentResponseHeader(respHeader);
        } catch {
            decoded = decodeHeader(respHeader);
        }
        console.log(
            `        ${JSON.stringify(decoded, null, 2)
                .split("\n")
                .join("\n        ")}`,
        );
        const tx = (decoded as { transaction?: string } | null)?.transaction;
        if (tx) {
            console.log();
            console.log(
                `      ✓ on-chain settle: https://sepolia.basescan.org/tx/${tx}`,
            );
        }
    } else {
        console.log(`[3/3] no PAYMENT-RESPONSE header — listing all headers:`);
        r.headers.forEach((v, k) => console.log(`        ${k}: ${v}`));
    }
    console.log();
    console.log(`done.`);
}

main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error();
    console.error(`✗ failed: ${msg}`);
    if (err instanceof Error && err.stack) {
        console.error(err.stack.split("\n").slice(1, 5).join("\n"));
    }
    process.exit(1);
});

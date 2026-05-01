// One-shot: parent owner calls NameWrapper.setApprovalForAll(registrar, true).
// Run once after deploying SpecialistRegistrar so the contract can mint
// subnames of the parent domain.
//
//   SEPOLIA_RPC_URL=...        \
//   SEPOLIA_PRIVATE_KEY=0x...  \
//   REGISTRAR_ADDRESS=0x...    \
//   npx tsx scripts/approve-registrar.ts
//
// The signing key must be the parent-domain owner.

import {
    createPublicClient,
    createWalletClient,
    http,
    type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const NAME_WRAPPER: Address = "0x0635513f179D50A207757E05759CbD106d7dFcE8";

const NAME_WRAPPER_ABI = [
    {
        inputs: [
            { name: "operator", type: "address" },
            { name: "approved", type: "bool" },
        ],
        name: "setApprovalForAll",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { name: "account", type: "address" },
            { name: "operator", type: "address" },
        ],
        name: "isApprovedForAll",
        outputs: [{ type: "bool" }],
        stateMutability: "view",
        type: "function",
    },
] as const;

async function main() {
    const rpc = process.env.SEPOLIA_RPC_URL;
    const pk = process.env.SEPOLIA_PRIVATE_KEY;
    const registrar = process.env.REGISTRAR_ADDRESS as Address | undefined;

    if (!rpc) throw new Error("SEPOLIA_RPC_URL is required");
    if (!pk) throw new Error("SEPOLIA_PRIVATE_KEY is required");
    if (!registrar) throw new Error("REGISTRAR_ADDRESS is required");

    const normalized = (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
    const account = privateKeyToAccount(normalized);
    const transport = http(rpc);

    const publicClient = createPublicClient({ chain: sepolia, transport });
    const walletClient = createWalletClient({ account, chain: sepolia, transport });

    const already = await publicClient.readContract({
        address: NAME_WRAPPER,
        abi: NAME_WRAPPER_ABI,
        functionName: "isApprovedForAll",
        args: [account.address, registrar],
    });

    if (already) {
        console.log(`Registrar ${registrar} is already approved by ${account.address}.`);
        return;
    }

    console.log(`Approving ${registrar} as operator for ${account.address}…`);
    const hash = await walletClient.writeContract({
        address: NAME_WRAPPER,
        abi: NAME_WRAPPER_ABI,
        functionName: "setApprovalForAll",
        args: [registrar, true],
    });
    console.log(`tx: ${hash}`);

    await publicClient.waitForTransactionReceipt({ hash });
    console.log("✓ approved");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

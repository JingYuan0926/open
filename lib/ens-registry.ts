import {
    createPublicClient,
    encodeFunctionData,
    http,
    namehash,
    type Address,
} from 'viem';
import { NAME_WRAPPER_ABI } from './abis/NameWrapper';
import { PUBLIC_RESOLVER_ABI } from './abis/PublicResolver';
import {
    ENS_CHAIN,
    ENS_PUBLIC_RESOLVER_ADDRESS,
    NAME_WRAPPER_ADDRESS,
    SEPOLIA_RPC_URL,
    SPECIALIST_TEXT_KEYS,
    type SpecialistRecords,
} from './networkConfig';

export const ONE_YEAR_SECONDS = BigInt(365 * 24 * 60 * 60);

const transport = http(SEPOLIA_RPC_URL);

export const publicClient = createPublicClient({ chain: ENS_CHAIN, transport });

const LABEL_RE = /^[a-z0-9-]+$/;

export function isValidLabel(label: string): boolean {
    return LABEL_RE.test(label) && label.length >= 3 && label.length <= 63;
}

// Encode the multicall payload that writes all 6 specialist text records on
// the public resolver. Caller must own the subname (or be an approved
// operator of its owner) — both true when the connected wallet just minted
// the wrapped subname to itself.
export function encodeTextRecordCalls(
    node: `0x${string}`,
    records: SpecialistRecords,
): `0x${string}`[] {
    const entries: Array<[string, string]> = [
        [SPECIALIST_TEXT_KEYS.axlPubkey, records.axlPubkey],
        [SPECIALIST_TEXT_KEYS.skills, records.skills],
        [SPECIALIST_TEXT_KEYS.workspaceUri, records.workspaceUri],
        [SPECIALIST_TEXT_KEYS.tokenId, records.tokenId],
        [SPECIALIST_TEXT_KEYS.price, records.price],
        [SPECIALIST_TEXT_KEYS.version, records.version],
    ];
    return entries.map(([key, value]) =>
        encodeFunctionData({
            abi: PUBLIC_RESOLVER_ABI,
            functionName: 'setText',
            args: [node, key, value],
        }),
    );
}

export type ReadSpecialistResult = {
    fullName: string;
    node: `0x${string}`;
    isWrapped: boolean;
    owner: Address | null;
    records: SpecialistRecords;
};

export async function readSpecialist(fullName: string): Promise<ReadSpecialistResult> {
    const node = namehash(fullName);

    let isWrapped = false;
    let owner: Address | null = null;
    try {
        isWrapped = await publicClient.readContract({
            address: NAME_WRAPPER_ADDRESS,
            abi: NAME_WRAPPER_ABI,
            functionName: 'isWrapped',
            args: [node],
        });
        if (isWrapped) {
            owner = await publicClient.readContract({
                address: NAME_WRAPPER_ADDRESS,
                abi: NAME_WRAPPER_ABI,
                functionName: 'ownerOf',
                args: [BigInt(node)],
            });
        }
    } catch {
        // leave as null
    }

    const keys = [
        SPECIALIST_TEXT_KEYS.axlPubkey,
        SPECIALIST_TEXT_KEYS.skills,
        SPECIALIST_TEXT_KEYS.workspaceUri,
        SPECIALIST_TEXT_KEYS.tokenId,
        SPECIALIST_TEXT_KEYS.price,
        SPECIALIST_TEXT_KEYS.version,
    ] as const;

    const values = await Promise.all(
        keys.map((key) =>
            publicClient
                .readContract({
                    address: ENS_PUBLIC_RESOLVER_ADDRESS,
                    abi: PUBLIC_RESOLVER_ABI,
                    functionName: 'text',
                    args: [node, key],
                })
                .catch(() => ''),
        ),
    );

    const [axlPubkey, skills, workspaceUri, tokenId, price, version] = values;
    return {
        fullName,
        node,
        isWrapped,
        owner,
        records: { axlPubkey, skills, workspaceUri, tokenId, price, version },
    };
}

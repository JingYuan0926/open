import {
    createPublicClient,
    createWalletClient,
    encodeFunctionData,
    http,
    namehash,
    type Address,
    type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { NAME_WRAPPER_ABI } from './abis/NameWrapper';
import { PUBLIC_RESOLVER_ABI } from './abis/PublicResolver';
import {
    ENS_CHAIN,
    ENS_PARENT_DOMAIN,
    ENS_PUBLIC_RESOLVER_ADDRESS,
    NAME_WRAPPER_ADDRESS,
    SEPOLIA_RPC_URL,
    SPECIALIST_TEXT_KEYS,
    type SpecialistRecords,
} from './networkConfig';

const ONE_YEAR_SECONDS = BigInt(365 * 24 * 60 * 60);

const transport = http(SEPOLIA_RPC_URL);

export const publicClient = createPublicClient({ chain: ENS_CHAIN, transport });

function getRegistrar() {
    const pk = process.env.ENS_REGISTRAR_PRIVATE_KEY;
    if (!pk) throw new Error('ENS_REGISTRAR_PRIVATE_KEY is not set');
    const normalized = (pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`;
    const account = privateKeyToAccount(normalized);
    const wallet = createWalletClient({ account, chain: ENS_CHAIN, transport });
    return { account, wallet };
}

export type RegistrarStatus = {
    registrarAddress: Address;
    parentDomain: string;
    parentNode: `0x${string}`;
    isWrapped: boolean;
    parentOwner: Address | null;
    canRegister: boolean;
    reason?: string;
};

export async function getRegistrarStatus(): Promise<RegistrarStatus> {
    const { account } = getRegistrar();
    const parentNode = namehash(ENS_PARENT_DOMAIN);

    let isWrapped = false;
    let parentOwner: Address | null = null;
    try {
        isWrapped = await publicClient.readContract({
            address: NAME_WRAPPER_ADDRESS,
            abi: NAME_WRAPPER_ABI,
            functionName: 'isWrapped',
            args: [parentNode],
        });
    } catch {
        // leave as false
    }

    if (isWrapped) {
        try {
            parentOwner = await publicClient.readContract({
                address: NAME_WRAPPER_ADDRESS,
                abi: NAME_WRAPPER_ABI,
                functionName: 'ownerOf',
                args: [BigInt(parentNode)],
            });
        } catch {
            parentOwner = null;
        }
    }

    let canRegister = false;
    let reason: string | undefined;
    if (!isWrapped) {
        reason = `${ENS_PARENT_DOMAIN} is not wrapped in NameWrapper. Wrap it via the ENS app first.`;
    } else if (!parentOwner) {
        reason = 'Could not read owner of the parent domain.';
    } else if (parentOwner.toLowerCase() === account.address.toLowerCase()) {
        canRegister = true;
    } else {
        // Operator-approved registrars can also create subnames.
        const approved = await publicClient.readContract({
            address: NAME_WRAPPER_ADDRESS,
            abi: NAME_WRAPPER_ABI,
            functionName: 'isApprovedForAll',
            args: [parentOwner, account.address],
        });
        if (approved) {
            canRegister = true;
        } else {
            reason = `Registrar wallet ${account.address} is not the owner of ${ENS_PARENT_DOMAIN} (${parentOwner}) and is not an approved operator.`;
        }
    }

    return {
        registrarAddress: account.address,
        parentDomain: ENS_PARENT_DOMAIN,
        parentNode,
        isWrapped,
        parentOwner,
        canRegister,
        reason,
    };
}

export type RegisterSpecialistInput = {
    label: string;          // subdomain label, e.g. "postgres-debug"
    records: SpecialistRecords;
    owner?: Address;        // defaults to registrar wallet
    expirySeconds?: number; // defaults to 1 year
};

export type RegisterSpecialistResult = {
    fullName: string;
    subdomainNode: `0x${string}`;
    subdomainTx: Hash;
    recordsTx: Hash;
    owner: Address;
};

const LABEL_RE = /^[a-z0-9-]+$/;

export async function registerSpecialist(
    input: RegisterSpecialistInput,
): Promise<RegisterSpecialistResult> {
    const { label } = input;
    if (!LABEL_RE.test(label) || label.length < 3 || label.length > 63) {
        throw new Error('Label must be 3-63 chars, lowercase letters, digits, hyphens.');
    }

    const status = await getRegistrarStatus();
    if (!status.canRegister) {
        throw new Error(status.reason ?? 'Registrar cannot create subnames.');
    }

    const { account, wallet } = getRegistrar();
    const owner = input.owner ?? account.address;
    const fullName = `${label}.${ENS_PARENT_DOMAIN}`;
    const subdomainNode = namehash(fullName);
    const expiry = BigInt(Math.floor(Date.now() / 1000)) +
        BigInt(input.expirySeconds ?? Number(ONE_YEAR_SECONDS));

    // tx 1: create wrapped subname pointing at the public resolver
    const subdomainTx = await wallet.writeContract({
        address: NAME_WRAPPER_ADDRESS,
        abi: NAME_WRAPPER_ABI,
        functionName: 'setSubnodeRecord',
        args: [
            status.parentNode,
            label,
            owner,
            ENS_PUBLIC_RESOLVER_ADDRESS,
            BigInt(0),    // ttl
            0,            // fuses (none burned)
            expiry,
        ],
    });
    await publicClient.waitForTransactionReceipt({ hash: subdomainTx });

    // tx 2: batch-write all 6 text records via resolver multicall.
    // Caller of multicall is the registrar wallet, which is the owner of the
    // subname (default case). If `owner` is overridden to a different address,
    // that wallet must call setText itself.
    if (owner.toLowerCase() !== account.address.toLowerCase()) {
        // Records can't be set in this tx because the registrar isn't the owner.
        // Caller must set them with their own wallet. Return a sentinel hash.
        return {
            fullName,
            subdomainNode,
            subdomainTx,
            recordsTx: '0x' as Hash,
            owner,
        };
    }

    const calls = textRecordCalls(subdomainNode, input.records);
    const recordsTx = await wallet.writeContract({
        address: ENS_PUBLIC_RESOLVER_ADDRESS,
        abi: PUBLIC_RESOLVER_ABI,
        functionName: 'multicall',
        args: [calls],
    });
    await publicClient.waitForTransactionReceipt({ hash: recordsTx });

    return { fullName, subdomainNode, subdomainTx, recordsTx, owner };
}

function textRecordCalls(node: `0x${string}`, records: SpecialistRecords): `0x${string}`[] {
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

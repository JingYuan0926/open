import { sepolia } from 'viem/chains';

export const ENS_CHAIN = sepolia;
export const ENS_CHAIN_ID = sepolia.id;

// Chains exposed to RainbowKit / wagmi for the connected wallet.
export const chains = [sepolia] as const;

// ENS NameWrapper on Sepolia
export const NAME_WRAPPER_ADDRESS = '0x0635513f179D50A207757E05759CbD106d7dFcE8' as const;

// ENS Public Resolver on Sepolia (the one ENS app sets by default for wrapped names)
export const ENS_PUBLIC_RESOLVER_ADDRESS = '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as const;

// SpecialistRegistrar on Sepolia — approved by the parent owner of
// righthand.eth on NameWrapper. Anyone can call register() to mint a wrapped
// subname (and have it transferred to them) in a single transaction.
export const SPECIALIST_REGISTRAR_ADDRESS =
    '0x03e69a73090A7E8392bC54BC24316a326020B128' as const;

// TaskMarket on Sepolia — approved by the parent owner of righthand.eth on
// NameWrapper. Each postTask also mints task-{id}.righthand.eth and writes
// description / skills / budget / deadline / creator / status text records.
export const TASK_MARKET_ADDRESS =
    '0x940883516834A5e14036fA86AA0f5Ec649BfAdf9' as const;

// Parent domain that owns the specialist subdomains. Must be a wrapped name
// whose owner (or NameWrapper-approved operator) is the connected wallet.
// Read NEXT_PUBLIC_ first so the value is available in the browser; fall back
// to the server-only var, then a sane default.
export const ENS_PARENT_DOMAIN =
    process.env.NEXT_PUBLIC_ENS_PARENT_DOMAIN ??
    process.env.ENS_PARENT_DOMAIN ??
    'righthand.eth';

// Sepolia RPC. Falls back to a public node so the app boots without a key.
export const SEPOLIA_RPC_URL =
    process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';

// Text record keys we standardise on for every Right-Hand specialist subname.
export const SPECIALIST_TEXT_KEYS = {
    axlPubkey: 'axl_pubkey',
    skills: 'skills',
    workspaceUri: '0g_workspace_uri',
    tokenId: '0g_token_id',
    price: 'price',
    version: 'version',
} as const;

export type SpecialistRecords = {
    axlPubkey: string;
    skills: string;        // comma-separated, e.g. "postgres-debug,linux-troubleshoot"
    workspaceUri: string;  // 0G Storage URI
    tokenId: string;       // iNFT token id on 0G Chain
    price: string;         // per-call price in 0G tokens
    version: string;       // semver, e.g. "0.1.0"
};

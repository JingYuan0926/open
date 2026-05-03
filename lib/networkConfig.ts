import { defineChain } from 'viem';
import { sepolia } from 'viem/chains';

export const ENS_CHAIN = sepolia;
export const ENS_CHAIN_ID = sepolia.id;

// 0G Galileo testnet — where the Right-Hand AI iNFTs live. Each agent
// owner mints their iNFT to themselves on this chain (user-signed) before
// the ENS subname is registered on Sepolia.
export const ZG_GALILEO_CHAIN_ID = 16602;
export const ZG_GALILEO = defineChain({
    id: ZG_GALILEO_CHAIN_ID,
    name: '0G Galileo',
    network: '0g-galileo',
    nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://evmrpc-testnet.0g.ai'] },
        public: { http: ['https://evmrpc-testnet.0g.ai'] },
    },
    blockExplorers: {
        default: { name: 'Chainscan', url: 'https://chainscan-galileo.0g.ai' },
    },
    testnet: true,
});

// Chains exposed to RainbowKit / wagmi for the connected wallet. Sepolia
// is the ENS chain; 0G Galileo is required so the wallet can sign the
// iNFT mint with the owner's own key.
export const chains = [sepolia, ZG_GALILEO] as const;

// ENS NameWrapper on Sepolia
export const NAME_WRAPPER_ADDRESS = '0x0635513f179D50A207757E05759CbD106d7dFcE8' as const;

// ENS Public Resolver on Sepolia (the one ENS app sets by default for wrapped names)
export const ENS_PUBLIC_RESOLVER_ADDRESS = '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as const;

// SpecialistRegistrar on Sepolia — approved by the parent owner of
// righthand.eth on NameWrapper. Anyone can call register() to mint a wrapped
// subname (and have it transferred to them) in a single transaction.
// v2 deployment exposes `getOwned(address)` for one-call discovery (used by
// `useMySpecialists`). Older versions without it return zero specialists.
export const SPECIALIST_REGISTRAR_ADDRESS =
    '0xAc1531A6b130aa3027130F97e33c80698e5cfafc' as const;

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

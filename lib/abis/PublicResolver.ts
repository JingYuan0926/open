// ENS Public Resolver ABI (Sepolia)
// Address: 0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5
// Only the methods we use: setText, text, setAddr, addr, multicall.

export const PUBLIC_RESOLVER_ABI = [
    {
        inputs: [
            { internalType: 'bytes32', name: 'node', type: 'bytes32' },
            { internalType: 'string', name: 'key', type: 'string' },
            { internalType: 'string', name: 'value', type: 'string' },
        ],
        name: 'setText',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { internalType: 'bytes32', name: 'node', type: 'bytes32' },
            { internalType: 'string', name: 'key', type: 'string' },
        ],
        name: 'text',
        outputs: [{ internalType: 'string', name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { internalType: 'bytes32', name: 'node', type: 'bytes32' },
            { internalType: 'address', name: 'a', type: 'address' },
        ],
        name: 'setAddr',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
        name: 'addr',
        outputs: [{ internalType: 'address payable', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'bytes[]', name: 'data', type: 'bytes[]' }],
        name: 'multicall',
        outputs: [{ internalType: 'bytes[]', name: 'results', type: 'bytes[]' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const;

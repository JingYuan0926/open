// ENS NameWrapper ABI (Sepolia)
// Address: 0x0635513f179D50A207757E05759CbD106d7dFcE8

export const NAME_WRAPPER_ABI = [
    // Create subname with owner, resolver, TTL, fuses, expiry
    {
        inputs: [
            { internalType: 'bytes32', name: 'parentNode', type: 'bytes32' },
            { internalType: 'string', name: 'label', type: 'string' },
            { internalType: 'address', name: 'owner', type: 'address' },
            { internalType: 'address', name: 'resolver', type: 'address' },
            { internalType: 'uint64', name: 'ttl', type: 'uint64' },
            { internalType: 'uint32', name: 'fuses', type: 'uint32' },
            { internalType: 'uint64', name: 'expiry', type: 'uint64' },
        ],
        name: 'setSubnodeRecord',
        outputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },

    // Owner of a wrapped name (ERC-1155). uint256(node) is the token id.
    {
        inputs: [{ internalType: 'uint256', name: 'id', type: 'uint256' }],
        name: 'ownerOf',
        outputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },

    // Check if a name is wrapped
    {
        inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
        name: 'isWrapped',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },

    // Approve an operator (e.g. backend wallet) to manage all wrapped names of caller
    {
        inputs: [
            { internalType: 'address', name: 'operator', type: 'address' },
            { internalType: 'bool', name: 'approved', type: 'bool' },
        ],
        name: 'setApprovalForAll',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },

    {
        inputs: [
            { internalType: 'address', name: 'account', type: 'address' },
            { internalType: 'address', name: 'operator', type: 'address' },
        ],
        name: 'isApprovedForAll',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// SpecialistRegistrar — anyone can call register() to mint a wrapped subname
// of the parent domain in a single transaction. The parent owner must have
// called NameWrapper.setApprovalForAll(registrar, true) once for this to work.

export const SPECIALIST_REGISTRAR_ABI = [
    {
        inputs: [
            { name: "label", type: "string" },
            {
                name: "records",
                type: "tuple",
                components: [
                    { name: "axlPubkey", type: "string" },
                    { name: "skills", type: "string" },
                    { name: "workspaceUri", type: "string" },
                    { name: "tokenId", type: "string" },
                    { name: "price", type: "string" },
                    { name: "version", type: "string" },
                ],
            },
        ],
        name: "register",
        outputs: [{ name: "node", type: "bytes32" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "parentNode",
        outputs: [{ type: "bytes32" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "nameWrapper",
        outputs: [{ type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "resolver",
        outputs: [{ type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ name: "owner", type: "address" }],
        name: "getOwned",
        outputs: [
            {
                name: "",
                type: "tuple[]",
                components: [
                    { name: "label", type: "string" },
                    { name: "node", type: "bytes32" },
                    { name: "owner", type: "address" },
                ],
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ name: "owner", type: "address" }],
        name: "ownedCount",
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "getAll",
        outputs: [
            {
                name: "",
                type: "tuple[]",
                components: [
                    { name: "label", type: "string" },
                    { name: "node", type: "bytes32" },
                    { name: "owner", type: "address" },
                ],
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "totalCount",
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "node", type: "bytes32" },
            { indexed: true, name: "owner", type: "address" },
            { indexed: false, name: "label", type: "string" },
        ],
        name: "SpecialistRegistered",
        type: "event",
    },
    { inputs: [], name: "InvalidLabel", type: "error" },
    { inputs: [], name: "RegistrarNotApproved", type: "error" },
] as const;

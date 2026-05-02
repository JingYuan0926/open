// TaskMarket — escrowed task board where every task is also a wrapped ENS
// subname `task-{id}.{parent}`. The contract owns the subname for the task's
// lifetime and updates the `status` text record on complete / cancel.
// Status enum: 0=Open, 1=Completed, 2=Cancelled.

export const TASK_MARKET_ABI = [
    {
        inputs: [
            { name: "_nameWrapper", type: "address" },
            { name: "_resolver", type: "address" },
            { name: "_parentNode", type: "bytes32" },
        ],
        stateMutability: "nonpayable",
        type: "constructor",
    },
    {
        inputs: [
            { name: "description", type: "string" },
            { name: "skillTags", type: "string" },
            { name: "deadline", type: "uint64" },
            { name: "maxSpecialists", type: "uint8" },
        ],
        name: "postTask",
        outputs: [
            { name: "taskId", type: "uint256" },
            { name: "ensNode", type: "bytes32" },
        ],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [{ name: "taskId", type: "uint256" }],
        name: "signOn",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ name: "taskId", type: "uint256" }],
        name: "completeTask",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ name: "taskId", type: "uint256" }],
        name: "cancelTask",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "withdraw",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ name: "taskId", type: "uint256" }],
        name: "getTask",
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "creator", type: "address" },
                    { name: "description", type: "string" },
                    { name: "skillTags", type: "string" },
                    { name: "budget", type: "uint256" },
                    { name: "deadline", type: "uint64" },
                    { name: "maxSpecialists", type: "uint8" },
                    { name: "status", type: "uint8" },
                    { name: "ensNode", type: "bytes32" },
                ],
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ name: "taskId", type: "uint256" }],
        name: "getTaskSpecialists",
        outputs: [{ name: "", type: "address[]" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ name: "taskId", type: "uint256" }],
        name: "taskLabel",
        outputs: [{ name: "", type: "string" }],
        stateMutability: "pure",
        type: "function",
    },
    {
        inputs: [],
        name: "tasksCount",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
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
        inputs: [
            { name: "", type: "uint256" },
            { name: "", type: "address" },
        ],
        name: "hasSignedOn",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ name: "", type: "address" }],
        name: "withdrawable",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "taskId", type: "uint256" },
            { indexed: true, name: "creator", type: "address" },
            { indexed: true, name: "ensNode", type: "bytes32" },
            { indexed: false, name: "label", type: "string" },
        ],
        name: "TaskPosted",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "taskId", type: "uint256" },
            { indexed: true, name: "specialist", type: "address" },
        ],
        name: "SpecialistSignedOn",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "taskId", type: "uint256" },
            { indexed: false, name: "perSpecialistPayout", type: "uint256" },
        ],
        name: "TaskCompleted",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [{ indexed: true, name: "taskId", type: "uint256" }],
        name: "TaskCancelled",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "who", type: "address" },
            { indexed: false, name: "amount", type: "uint256" },
        ],
        name: "Withdrawal",
        type: "event",
    },
    { inputs: [], name: "EmptyDescription", type: "error" },
    { inputs: [], name: "DeadlineInPast", type: "error" },
    { inputs: [], name: "InvalidMaxSpecialists", type: "error" },
    { inputs: [], name: "NoBudget", type: "error" },
    { inputs: [], name: "TaskNotOpen", type: "error" },
    { inputs: [], name: "TaskFull", type: "error" },
    { inputs: [], name: "DeadlinePassed", type: "error" },
    { inputs: [], name: "AlreadySignedOn", type: "error" },
    { inputs: [], name: "NotCreator", type: "error" },
    { inputs: [], name: "NoSpecialists", type: "error" },
    { inputs: [], name: "HasSpecialists", type: "error" },
    { inputs: [], name: "NothingToWithdraw", type: "error" },
    { inputs: [], name: "TransferFailed", type: "error" },
    { inputs: [], name: "RegistrarNotApproved", type: "error" },
    { inputs: [], name: "LabelAlreadyTaken", type: "error" },
] as const;

export const TASK_STATUS = {
    Open: 0,
    Completed: 1,
    Cancelled: 2,
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

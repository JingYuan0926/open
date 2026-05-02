"use client";

// SpecialistRegistrar — wagmi hooks for the contract at
// SPECIALIST_REGISTRAR_ADDRESS. ABI lives in lib/abis/SpecialistRegistrar.

import { useCallback, useEffect, useMemo, useState } from "react";
import { namehash, type Address, type Hash } from "viem";
import {
    useAccount,
    usePublicClient,
    useReadContract,
    useWaitForTransactionReceipt,
    useWriteContract,
} from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { NAME_WRAPPER_ABI } from "../abis/NameWrapper";
import { PUBLIC_RESOLVER_ABI } from "../abis/PublicResolver";
import { SPECIALIST_REGISTRAR_ABI } from "../abis/SpecialistRegistrar";
import {
    ENS_CHAIN_ID,
    ENS_PARENT_DOMAIN,
    ENS_PUBLIC_RESOLVER_ADDRESS,
    NAME_WRAPPER_ADDRESS,
    SPECIALIST_REGISTRAR_ADDRESS,
    SPECIALIST_TEXT_KEYS,
    type SpecialistRecords,
} from "../networkConfig";
import { isValidLabel } from "../ens-registry";

// ─── useParentStatus ───────────────────────────────────────────────────────
// Reads parent-domain state from NameWrapper and tells the caller whether the
// connected wallet can register a subname through the SpecialistRegistrar
// contract. Allowed iff a wallet is connected, the parent is wrapped, and the
// parent owner has called setApprovalForAll(registrar, true) on NameWrapper.

export type ParentStatus = {
    parentDomain: string;
    parentNode: `0x${string}`;
    isLoading: boolean;
    isWrapped: boolean;
    parentOwner: Address | null;
    connectedAddress: Address | undefined;
    registrarAddress: Address;
    registrarApproved: boolean;
    canRegister: boolean;
    reason?: string;
};

export function useParentStatus(): ParentStatus {
    const { address: connectedAddress } = useAccount();
    const parentNode = useMemo(
        () => namehash(ENS_PARENT_DOMAIN) as `0x${string}`,
        [],
    );

    const { data: isWrapped, isLoading: wrappedLoading } = useReadContract({
        address: NAME_WRAPPER_ADDRESS,
        abi: NAME_WRAPPER_ABI,
        functionName: "isWrapped",
        args: [parentNode],
        chainId: ENS_CHAIN_ID,
    });

    const { data: parentOwner, isLoading: ownerLoading } = useReadContract({
        address: NAME_WRAPPER_ADDRESS,
        abi: NAME_WRAPPER_ABI,
        functionName: "ownerOf",
        args: [BigInt(parentNode)],
        chainId: ENS_CHAIN_ID,
        query: { enabled: Boolean(isWrapped) },
    });

    const { data: registrarApproved, isLoading: approvedLoading } =
        useReadContract({
            address: NAME_WRAPPER_ADDRESS,
            abi: NAME_WRAPPER_ABI,
            functionName: "isApprovedForAll",
            args: parentOwner
                ? [parentOwner as Address, SPECIALIST_REGISTRAR_ADDRESS]
                : undefined,
            chainId: ENS_CHAIN_ID,
            query: { enabled: Boolean(parentOwner) },
        });

    const isLoading = wrappedLoading || ownerLoading || approvedLoading;

    let canRegister = false;
    let reason: string | undefined;

    if (!connectedAddress) {
        reason = "Connect a wallet to register a subname.";
    } else if (isWrapped === false) {
        reason = `${ENS_PARENT_DOMAIN} is not wrapped in NameWrapper. Wrap it via the ENS app first.`;
    } else if (!parentOwner) {
        reason = "Parent ownership is still loading.";
    } else if (!registrarApproved) {
        reason = `Parent owner ${parentOwner} has not approved the registrar contract (${SPECIALIST_REGISTRAR_ADDRESS}). Run scripts/approve-registrar.ts once.`;
    } else {
        canRegister = true;
    }

    return {
        parentDomain: ENS_PARENT_DOMAIN,
        parentNode,
        isLoading,
        isWrapped: Boolean(isWrapped),
        parentOwner: (parentOwner as Address | undefined) ?? null,
        connectedAddress,
        registrarAddress: SPECIALIST_REGISTRAR_ADDRESS,
        registrarApproved: Boolean(registrarApproved),
        canRegister,
        reason,
    };
}

// ─── useRegisterSpecialist ─────────────────────────────────────────────────
// Single-tx flow: caller invokes SpecialistRegistrar.register(label, records).
// The contract mints the wrapped subname to itself, sets all 6 text records,
// and transfers the wrapped ERC1155 token to msg.sender.

export type RegisterStep =
    | "idle"
    | "registering"
    | "confirming"
    | "success"
    | "error";

export type RegisterResult = {
    fullName: string;
    subdomainNode: `0x${string}`;
    txHash: Hash;
    owner: Address;
};

export function useRegisterSpecialist() {
    const { address } = useAccount();

    const [step, setStep] = useState<RegisterStep>("idle");
    const [error, setError] = useState<Error | null>(null);
    const [pending, setPending] = useState<{
        fullName: string;
        subdomainNode: `0x${string}`;
    } | null>(null);
    const [result, setResult] = useState<RegisterResult | null>(null);

    const {
        writeContract,
        data: txHash,
        error: writeError,
        reset: resetWrite,
    } = useWriteContract();

    const {
        isLoading: confirming,
        isSuccess: confirmed,
        error: receiptError,
    } = useWaitForTransactionReceipt({ hash: txHash, chainId: ENS_CHAIN_ID });

    const reset = useCallback(() => {
        setStep("idle");
        setError(null);
        setPending(null);
        setResult(null);
        resetWrite();
    }, [resetWrite]);

    const register = useCallback(
        (label: string, records: SpecialistRecords) => {
            if (!address) {
                setError(new Error("Wallet not connected"));
                setStep("error");
                return;
            }
            if (!isValidLabel(label)) {
                setError(
                    new Error(
                        "Label must be 3-63 chars, lowercase letters / digits / hyphens.",
                    ),
                );
                setStep("error");
                return;
            }

            const fullName = `${label}.${ENS_PARENT_DOMAIN}`;
            const subdomainNode = namehash(fullName) as `0x${string}`;

            setError(null);
            setResult(null);
            setPending({ fullName, subdomainNode });
            setStep("registering");

            writeContract({
                address: SPECIALIST_REGISTRAR_ADDRESS,
                abi: SPECIALIST_REGISTRAR_ABI,
                functionName: "register",
                args: [label, records],
                chainId: ENS_CHAIN_ID,
            });
        },
        [address, writeContract],
    );

    useEffect(() => {
        if (txHash && step === "registering") setStep("confirming");
    }, [txHash, step]);

    useEffect(() => {
        if (
            !confirmed ||
            step !== "confirming" ||
            !pending ||
            !txHash ||
            !address
        ) {
            return;
        }
        setResult({
            fullName: pending.fullName,
            subdomainNode: pending.subdomainNode,
            txHash,
            owner: address,
        });
        setStep("success");
    }, [confirmed, step, pending, txHash, address]);

    useEffect(() => {
        const err = writeError || receiptError;
        if (err) {
            setError(err as Error);
            setStep("error");
        }
    }, [writeError, receiptError]);

    return {
        step,
        error,
        result,
        txHash,
        confirming,
        register,
        reset,
        isBusy: step === "registering" || step === "confirming",
    };
}

// ─── useMySpecialists ──────────────────────────────────────────────────────
// Returns every specialist the connected wallet has registered through this
// contract, by reading the on-chain `getOwned(address)` view (one RPC call,
// no event-log scan). For each entry, the six text records are batched
// through Multicall3 in a single follow-up call.
//
// Note: per the contract's `_ownedByCaller` comment, this is registration
// history, not live ownership — if a wrapped subname has been transferred
// elsewhere after registration, it remains in the list.

const TEXT_KEY_ORDER = [
    SPECIALIST_TEXT_KEYS.axlPubkey,
    SPECIALIST_TEXT_KEYS.skills,
    SPECIALIST_TEXT_KEYS.workspaceUri,
    SPECIALIST_TEXT_KEYS.tokenId,
    SPECIALIST_TEXT_KEYS.price,
    SPECIALIST_TEXT_KEYS.version,
] as const;

export type MySpecialist = {
    label: string;
    fullName: string;
    node: `0x${string}`;
    owner: Address;
    records: SpecialistRecords;
};

export function useMySpecialists() {
    const { address } = useAccount();
    const client = usePublicClient({ chainId: ENS_CHAIN_ID });

    return useQuery<MySpecialist[]>({
        queryKey: ["my-specialists", ENS_CHAIN_ID, address],
        enabled: Boolean(address && client),
        staleTime: 30_000,
        queryFn: async () => {
            if (!address || !client) return [];

            const owned = await client.readContract({
                address: SPECIALIST_REGISTRAR_ADDRESS,
                abi: SPECIALIST_REGISTRAR_ABI,
                functionName: "getOwned",
                args: [address],
            });

            const results = await Promise.all(
                owned.map(async (reg): Promise<MySpecialist> => {
                    const reads = await client.multicall({
                        contracts: TEXT_KEY_ORDER.map((key) => ({
                            address: ENS_PUBLIC_RESOLVER_ADDRESS,
                            abi: PUBLIC_RESOLVER_ABI,
                            functionName: "text" as const,
                            args: [reg.node, key] as const,
                        })),
                        allowFailure: true,
                    });
                    const texts = reads.map((r) =>
                        r.status === "success" ? (r.result as string) : "",
                    );
                    const [
                        axlPubkey,
                        skills,
                        workspaceUri,
                        tokenId,
                        price,
                        version,
                    ] = texts;

                    return {
                        label: reg.label,
                        fullName: `${reg.label}.${ENS_PARENT_DOMAIN}`,
                        node: reg.node,
                        owner: address,
                        records: {
                            axlPubkey,
                            skills,
                            workspaceUri,
                            tokenId,
                            price,
                            version,
                        },
                    };
                }),
            );

            // Newest first (the contract pushes append, so latest is last).
            return results.reverse();
        },
    });
}

// ─── useAllSpecialists ─────────────────────────────────────────────────────
// Returns every specialist ever registered through the contract, across every
// owner — reads `getAll()` once and batches the six text-record reads per
// node through Multicall3 (one extra RPC call total).
//
// Same caveat as `useMySpecialists`: registration history, not current
// ownership. If a wrapped subname has been transferred after registration,
// the entry stays in the list (registrar can't observe NameWrapper transfers).

export type AnySpecialist = {
    label: string;
    fullName: string;
    node: `0x${string}`;
    owner: Address;
    records: SpecialistRecords;
};

export function useAllSpecialists() {
    const client = usePublicClient({ chainId: ENS_CHAIN_ID });

    return useQuery<AnySpecialist[]>({
        queryKey: ["all-specialists", ENS_CHAIN_ID],
        enabled: Boolean(client),
        staleTime: 30_000,
        queryFn: async () => {
            if (!client) return [];

            const all = await client.readContract({
                address: SPECIALIST_REGISTRAR_ADDRESS,
                abi: SPECIALIST_REGISTRAR_ABI,
                functionName: "getAll",
            });

            if (all.length === 0) return [];

            // Flatten every (node, key) read into a single Multicall3 batch
            // so the cost is O(1) RPC roundtrips regardless of list length.
            const flatCalls = all.flatMap((reg) =>
                TEXT_KEY_ORDER.map((key) => ({
                    address: ENS_PUBLIC_RESOLVER_ADDRESS,
                    abi: PUBLIC_RESOLVER_ABI,
                    functionName: "text" as const,
                    args: [reg.node, key] as const,
                })),
            );

            const reads = await client.multicall({
                contracts: flatCalls,
                allowFailure: true,
            });

            const results: AnySpecialist[] = all.map((reg, i) => {
                const slice = reads.slice(
                    i * TEXT_KEY_ORDER.length,
                    (i + 1) * TEXT_KEY_ORDER.length,
                );
                const [
                    axlPubkey,
                    skills,
                    workspaceUri,
                    tokenId,
                    price,
                    version,
                ] = slice.map((r) =>
                    r.status === "success" ? (r.result as string) : "",
                );
                return {
                    label: reg.label,
                    fullName: `${reg.label}.${ENS_PARENT_DOMAIN}`,
                    node: reg.node,
                    owner: reg.owner,
                    records: {
                        axlPubkey,
                        skills,
                        workspaceUri,
                        tokenId,
                        price,
                        version,
                    },
                };
            });

            // Newest first.
            return results.reverse();
        },
    });
}

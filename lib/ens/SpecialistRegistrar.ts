"use client";

// SpecialistRegistrar — wagmi hooks for the contract at
// SPECIALIST_REGISTRAR_ADDRESS. ABI lives in lib/abis/SpecialistRegistrar.

import { useCallback, useEffect, useMemo, useState } from "react";
import { namehash, type Address, type Hash } from "viem";
import {
    useAccount,
    useReadContract,
    useWaitForTransactionReceipt,
    useWriteContract,
} from "wagmi";
import { NAME_WRAPPER_ABI } from "../abis/NameWrapper";
import { SPECIALIST_REGISTRAR_ABI } from "../abis/SpecialistRegistrar";
import {
    ENS_CHAIN_ID,
    ENS_PARENT_DOMAIN,
    NAME_WRAPPER_ADDRESS,
    SPECIALIST_REGISTRAR_ADDRESS,
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

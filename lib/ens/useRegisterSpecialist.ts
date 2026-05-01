"use client";

import { useCallback, useEffect, useState } from "react";
import { namehash, type Address, type Hash } from "viem";
import {
    useAccount,
    useWaitForTransactionReceipt,
    useWriteContract,
} from "wagmi";
import { SPECIALIST_REGISTRAR_ABI } from "../abis/SpecialistRegistrar";
import {
    ENS_CHAIN_ID,
    ENS_PARENT_DOMAIN,
    SPECIALIST_REGISTRAR_ADDRESS,
    type SpecialistRecords,
} from "../networkConfig";
import { isValidLabel } from "../ens-registry";

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

// Single-tx flow: caller invokes SpecialistRegistrar.register(label, records).
// The contract mints the wrapped subname to itself, sets all 6 text records,
// and transfers the wrapped ERC1155 token to msg.sender. Any wallet can call
// it as long as the parent owner has approved the contract on NameWrapper.
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

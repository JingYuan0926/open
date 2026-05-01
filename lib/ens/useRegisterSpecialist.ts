"use client";

import { useCallback, useEffect, useState } from "react";
import { namehash, type Address, type Hash } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { NAME_WRAPPER_ABI } from "../abis/NameWrapper";
import { PUBLIC_RESOLVER_ABI } from "../abis/PublicResolver";
import {
    ENS_CHAIN_ID,
    ENS_PARENT_DOMAIN,
    ENS_PUBLIC_RESOLVER_ADDRESS,
    NAME_WRAPPER_ADDRESS,
    type SpecialistRecords,
} from "../networkConfig";
import { encodeTextRecordCalls, isValidLabel, ONE_YEAR_SECONDS } from "../ens-registry";

export type RegisterStep =
    | "idle"
    | "minting"
    | "mintConfirming"
    | "writingRecords"
    | "recordsConfirming"
    | "success"
    | "error";

export type RegisterResult = {
    fullName: string;
    subdomainNode: `0x${string}`;
    subdomainTx: Hash;
    recordsTx: Hash;
    owner: Address;
};

// Two-tx client-side flow. Connected wallet:
//   1. mints a wrapped subname owned by itself (NameWrapper.setSubnodeRecord)
//   2. writes 6 text records via the public resolver's multicall
// Both txs are signed and paid for by the connected wallet.
export function useRegisterSpecialist() {
    const { address } = useAccount();

    const [step, setStep] = useState<RegisterStep>("idle");
    const [error, setError] = useState<Error | null>(null);
    const [pending, setPending] = useState<{
        label: string;
        records: SpecialistRecords;
        subdomainNode: `0x${string}`;
        fullName: string;
    } | null>(null);
    const [result, setResult] = useState<RegisterResult | null>(null);

    const {
        writeContract: writeMint,
        data: mintHash,
        error: mintError,
        reset: resetMint,
    } = useWriteContract();

    const {
        writeContract: writeRecords,
        data: recordsHash,
        error: recordsError,
        reset: resetRecords,
    } = useWriteContract();

    const {
        isLoading: mintConfirming,
        isSuccess: mintConfirmed,
        error: mintReceiptError,
    } = useWaitForTransactionReceipt({ hash: mintHash, chainId: ENS_CHAIN_ID });

    const {
        isLoading: recordsConfirming,
        isSuccess: recordsConfirmed,
        error: recordsReceiptError,
    } = useWaitForTransactionReceipt({
        hash: recordsHash,
        chainId: ENS_CHAIN_ID,
    });

    const reset = useCallback(() => {
        setStep("idle");
        setError(null);
        setPending(null);
        setResult(null);
        resetMint();
        resetRecords();
    }, [resetMint, resetRecords]);

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
            const expiry =
                BigInt(Math.floor(Date.now() / 1000)) + ONE_YEAR_SECONDS;
            const parentNode = namehash(ENS_PARENT_DOMAIN) as `0x${string}`;

            setError(null);
            setResult(null);
            setPending({ label, records, subdomainNode, fullName });
            setStep("minting");

            writeMint({
                address: NAME_WRAPPER_ADDRESS,
                abi: NAME_WRAPPER_ABI,
                functionName: "setSubnodeRecord",
                args: [
                    parentNode,
                    label,
                    address,
                    ENS_PUBLIC_RESOLVER_ADDRESS,
                    BigInt(0),
                    0,
                    expiry,
                ],
                chainId: ENS_CHAIN_ID,
            });
        },
        [address, writeMint],
    );

    // step 1 sent → wait for confirmation
    useEffect(() => {
        if (mintHash && step === "minting") setStep("mintConfirming");
    }, [mintHash, step]);

    // step 1 confirmed → fire step 2 (multicall text records)
    useEffect(() => {
        if (!mintConfirmed || step !== "mintConfirming" || !pending) return;
        const calls = encodeTextRecordCalls(pending.subdomainNode, pending.records);
        setStep("writingRecords");
        writeRecords({
            address: ENS_PUBLIC_RESOLVER_ADDRESS,
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "multicall",
            args: [calls],
            chainId: ENS_CHAIN_ID,
        });
    }, [mintConfirmed, step, pending, writeRecords]);

    // step 2 sent → wait for confirmation
    useEffect(() => {
        if (recordsHash && step === "writingRecords") {
            setStep("recordsConfirming");
        }
    }, [recordsHash, step]);

    // step 2 confirmed → success
    useEffect(() => {
        if (
            !recordsConfirmed ||
            step !== "recordsConfirming" ||
            !pending ||
            !mintHash ||
            !recordsHash ||
            !address
        ) {
            return;
        }
        setResult({
            fullName: pending.fullName,
            subdomainNode: pending.subdomainNode,
            subdomainTx: mintHash,
            recordsTx: recordsHash,
            owner: address,
        });
        setStep("success");
    }, [recordsConfirmed, step, pending, mintHash, recordsHash, address]);

    // surface any error from either tx
    useEffect(() => {
        const err =
            mintError || mintReceiptError || recordsError || recordsReceiptError;
        if (err) {
            setError(err as Error);
            setStep("error");
        }
    }, [mintError, mintReceiptError, recordsError, recordsReceiptError]);

    return {
        step,
        error,
        result,
        mintHash,
        recordsHash,
        mintConfirming,
        recordsConfirming,
        register,
        reset,
        isBusy:
            step === "minting" ||
            step === "mintConfirming" ||
            step === "writingRecords" ||
            step === "recordsConfirming",
    };
}

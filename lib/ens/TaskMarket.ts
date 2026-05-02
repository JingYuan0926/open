"use client";

// TaskMarket — wagmi hooks for the contract at TASK_MARKET_ADDRESS.
// ABI + TASK_STATUS enum live in lib/abis/TaskMarket.

import { useMemo } from "react";
import type { Address } from "viem";
import {
    useReadContract,
    useReadContracts,
    useWaitForTransactionReceipt,
    useWriteContract,
} from "wagmi";
import { TASK_MARKET_ABI } from "../abis/TaskMarket";
import { ENS_CHAIN_ID, TASK_MARKET_ADDRESS } from "../networkConfig";

export type Task = {
    creator: Address;
    description: string;
    skillTags: string;
    budget: bigint;
    deadline: bigint;
    maxSpecialists: number;
    status: number;
    ensNode: `0x${string}`;
};

export type TaskWithSpecialists = {
    id: bigint;
    task: Task;
    specialists: Address[];
};

// ─── Reads ──────────────────────────────────────────────────────────────────

// Reads tasksCount, then batches getTask + getTaskSpecialists for every id.
// Returns descending (newest first) so the UI shows fresh tasks at the top.
export function useTasks(): {
    tasks: TaskWithSpecialists[];
    isLoading: boolean;
    refetch: () => void;
} {
    const { data: count, refetch: refetchCount, isLoading: countLoading } =
        useReadContract({
            address: TASK_MARKET_ADDRESS,
            abi: TASK_MARKET_ABI,
            functionName: "tasksCount",
            chainId: ENS_CHAIN_ID,
        });

    const ids = useMemo(() => {
        const n = count ? Number(count) : 0;
        return Array.from({ length: n }, (_, i) => BigInt(i));
    }, [count]);

    const taskCalls = useMemo(
        () =>
            ids.map((id) => ({
                address: TASK_MARKET_ADDRESS,
                abi: TASK_MARKET_ABI,
                functionName: "getTask" as const,
                args: [id] as const,
                chainId: ENS_CHAIN_ID,
            })),
        [ids],
    );

    const specialistCalls = useMemo(
        () =>
            ids.map((id) => ({
                address: TASK_MARKET_ADDRESS,
                abi: TASK_MARKET_ABI,
                functionName: "getTaskSpecialists" as const,
                args: [id] as const,
                chainId: ENS_CHAIN_ID,
            })),
        [ids],
    );

    const {
        data: taskData,
        isLoading: tasksLoading,
        refetch: refetchTasks,
    } = useReadContracts({
        contracts: taskCalls,
        query: { enabled: ids.length > 0 },
    });

    const {
        data: specialistData,
        isLoading: specialistsLoading,
        refetch: refetchSpecialists,
    } = useReadContracts({
        contracts: specialistCalls,
        query: { enabled: ids.length > 0 },
    });

    const tasks: TaskWithSpecialists[] = useMemo(() => {
        if (!taskData || !specialistData) return [];
        const rows: TaskWithSpecialists[] = [];
        for (let i = 0; i < ids.length; i++) {
            const t = taskData[i]?.result as Task | undefined;
            const s = specialistData[i]?.result as Address[] | undefined;
            if (!t) continue;
            rows.push({ id: ids[i], task: t, specialists: s ?? [] });
        }
        return rows.reverse();
    }, [taskData, specialistData, ids]);

    return {
        tasks,
        isLoading: countLoading || tasksLoading || specialistsLoading,
        refetch: () => {
            refetchCount();
            refetchTasks();
            refetchSpecialists();
        },
    };
}

export function useWithdrawable(addr: Address | undefined) {
    return useReadContract({
        address: TASK_MARKET_ADDRESS,
        abi: TASK_MARKET_ABI,
        functionName: "withdrawable",
        args: addr ? [addr] : undefined,
        chainId: ENS_CHAIN_ID,
        query: { enabled: Boolean(addr) },
    });
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export function usePostTask() {
    const { writeContract, data: hash, error, reset } = useWriteContract();
    const { isLoading: confirming, isSuccess: confirmed } =
        useWaitForTransactionReceipt({ hash, chainId: ENS_CHAIN_ID });

    const post = (
        description: string,
        skillTags: string,
        deadline: bigint,
        maxSpecialists: number,
        budgetWei: bigint,
    ) => {
        writeContract({
            address: TASK_MARKET_ADDRESS,
            abi: TASK_MARKET_ABI,
            functionName: "postTask",
            args: [description, skillTags, deadline, maxSpecialists],
            value: budgetWei,
            chainId: ENS_CHAIN_ID,
        });
    };

    return { post, hash, confirming, confirmed, error, reset };
}

function useTaskAction(functionName: "signOn" | "completeTask" | "cancelTask") {
    const { writeContract, data: hash, error, reset } = useWriteContract();
    const { isLoading: confirming, isSuccess: confirmed } =
        useWaitForTransactionReceipt({ hash, chainId: ENS_CHAIN_ID });

    const run = (taskId: bigint) => {
        writeContract({
            address: TASK_MARKET_ADDRESS,
            abi: TASK_MARKET_ABI,
            functionName,
            args: [taskId],
            chainId: ENS_CHAIN_ID,
        });
    };

    return { run, hash, confirming, confirmed, error, reset };
}

export const useSignOnTask = () => useTaskAction("signOn");
export const useCompleteTask = () => useTaskAction("completeTask");
export const useCancelTask = () => useTaskAction("cancelTask");

export function useWithdraw() {
    const { writeContract, data: hash, error, reset } = useWriteContract();
    const { isLoading: confirming, isSuccess: confirmed } =
        useWaitForTransactionReceipt({ hash, chainId: ENS_CHAIN_ID });

    const withdraw = () => {
        writeContract({
            address: TASK_MARKET_ADDRESS,
            abi: TASK_MARKET_ABI,
            functionName: "withdraw",
            chainId: ENS_CHAIN_ID,
        });
    };

    return { withdraw, hash, confirming, confirmed, error, reset };
}

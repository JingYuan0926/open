"use client";

import { useMemo } from "react";
import { namehash, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { NAME_WRAPPER_ABI } from "../abis/NameWrapper";
import {
    ENS_CHAIN_ID,
    ENS_PARENT_DOMAIN,
    NAME_WRAPPER_ADDRESS,
} from "../networkConfig";

export type ParentStatus = {
    parentDomain: string;
    parentNode: `0x${string}`;
    isLoading: boolean;
    isWrapped: boolean;
    parentOwner: Address | null;
    connectedAddress: Address | undefined;
    canRegister: boolean;
    reason?: string;
};

// Reads parent-domain state from NameWrapper and tells the caller whether the
// connected wallet is allowed to mint subnames. Allowed iff:
//   - parent is wrapped, AND
//   - connected wallet IS the parent owner, OR
//   - parent owner has called setApprovalForAll(connected, true) on NameWrapper.
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

    const isOwner =
        !!connectedAddress &&
        !!parentOwner &&
        (parentOwner as Address).toLowerCase() ===
            connectedAddress.toLowerCase();

    const { data: isApproved, isLoading: approvedLoading } = useReadContract({
        address: NAME_WRAPPER_ADDRESS,
        abi: NAME_WRAPPER_ABI,
        functionName: "isApprovedForAll",
        args:
            parentOwner && connectedAddress
                ? [parentOwner as Address, connectedAddress]
                : undefined,
        chainId: ENS_CHAIN_ID,
        query: {
            enabled: Boolean(parentOwner && connectedAddress && !isOwner),
        },
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
    } else if (isOwner) {
        canRegister = true;
    } else if (isApproved) {
        canRegister = true;
    } else {
        reason = `Connected wallet ${connectedAddress} does not own ${ENS_PARENT_DOMAIN} (${parentOwner}) and is not an approved operator on NameWrapper.`;
    }

    return {
        parentDomain: ENS_PARENT_DOMAIN,
        parentNode,
        isLoading,
        isWrapped: Boolean(isWrapped),
        parentOwner: (parentOwner as Address | undefined) ?? null,
        connectedAddress,
        canRegister,
        reason,
    };
}

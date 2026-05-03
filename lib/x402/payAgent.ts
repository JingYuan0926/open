"use client";

import { useCallback, useState } from "react";

// Client driver for the x402-shaped /api/x402/pay-agent endpoint.
// First POST returns 402 + paymentRequirements; second POST submits the
// X-PAYMENT header (base64 JSON) and the server pushes the on-chain tx.

const X402_VERSION = 1;
const SCHEME = "exact";
const NETWORK = "base-sepolia";

export type PayAgentInput = {
    agentName: string;
    ownerAddress: string;
    priceOG: string;
};

export type PaymentRequirements = {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    payTo: string;
    asset: string;
    extra?: {
        chainId: number;
        agentName: string;
        humanReadableAmount: string;
    };
};

export type PayAgentSuccess = {
    txHash: string;
    from: string;
    payTo: string;
    amount: string;
    network: string;
    chainId: number;
    explorerUrl: string;
    blockNumber: number;
};

export type PayStep =
    | "idle"
    | "requesting"
    | "got-402"
    | "paying"
    | "success"
    | "error";

export function usePayAgent() {
    const [step, setStep] = useState<PayStep>("idle");
    const [error, setError] = useState<string | null>(null);
    const [requirements, setRequirements] =
        useState<PaymentRequirements | null>(null);
    const [result, setResult] = useState<PayAgentSuccess | null>(null);

    const reset = useCallback(() => {
        setStep("idle");
        setError(null);
        setRequirements(null);
        setResult(null);
    }, []);

    const pay = useCallback(async (input: PayAgentInput) => {
        setStep("requesting");
        setError(null);
        setRequirements(null);
        setResult(null);

        try {
            // Step 1 — discover payment requirements (expect HTTP 402).
            const r1 = await fetch("/api/x402/pay-agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            });

            if (r1.status !== 402) {
                const text = await r1.text();
                throw new Error(
                    `Expected HTTP 402 from x402 endpoint, got ${r1.status}: ${text}`,
                );
            }

            const j1 = await r1.json();
            const accept = j1.accepts?.[0] as PaymentRequirements | undefined;
            if (!accept) throw new Error("402 response missing 'accepts'");
            setRequirements(accept);
            setStep("got-402");

            // Step 2 — encode the X-PAYMENT header and resubmit.
            const paymentPayload = {
                x402Version: X402_VERSION,
                scheme: SCHEME,
                network: NETWORK,
                payload: {
                    confirm: true,
                    payTo: accept.payTo,
                    amount: accept.maxAmountRequired,
                    agentName: input.agentName,
                },
            };
            const xPayment = btoa(JSON.stringify(paymentPayload));

            setStep("paying");
            const r2 = await fetch("/api/x402/pay-agent", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-PAYMENT": xPayment,
                },
                body: JSON.stringify(input),
            });

            const j2 = await r2.json();
            if (!r2.ok || !j2.success) {
                throw new Error(j2.error || `HTTP ${r2.status}`);
            }

            setResult(j2 as PayAgentSuccess);
            setStep("success");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            setStep("error");
        }
    }, []);

    return {
        step,
        error,
        requirements,
        result,
        pay,
        reset,
        isBusy:
            step === "requesting" || step === "got-402" || step === "paying",
    };
}

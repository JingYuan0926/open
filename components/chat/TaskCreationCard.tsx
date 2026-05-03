"use client";

import * as React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseEther, parseEventLogs } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TASK_MARKET_ABI } from "@/lib/abis/TaskMarket";
import {
  ENS_CHAIN_ID,
  ENS_PARENT_DOMAIN,
  TASK_MARKET_ADDRESS,
} from "@/lib/networkConfig";

// Light keyword routing — picks a few skill tags from the user's prompt so
// the right specialists in the marketplace can match. Backend-only now;
// not exposed in the form.
export function suggestSkills(prompt: string): string {
  const p = prompt.toLowerCase();
  const tags: string[] = [];
  const add = (re: RegExp, ts: string[]) => {
    if (re.test(p)) ts.forEach((t) => { if (!tags.includes(t)) tags.push(t); });
  };
  add(/ec2|aws|cloud|s3|iam|vpc|cloudformation/, ["aws", "ec2", "iam", "security-group"]);
  add(/postgres|psql|database|\bsql\b/, ["postgres-debug", "db", "sql"]);
  add(/openclaw/, ["openclaw", "install", "ssh"]);
  add(/migrat/, ["migration", "schema"]);
  add(/wifi|network/, ["network", "wifi", "linux-troubleshoot"]);
  add(/dependenc|package|npm|pnpm/, ["npm", "pnpm", "lockfile"]);
  add(/test|verify|sanity|\bci\b/, ["tests", "verify", "ci"]);
  return tags.length > 0 ? tags.join(",") : "general";
}

type Step = "editing" | "awaiting" | "confirming" | "posted" | "error";

const DEADLINE_MIN = 5;
const DEADLINE_MAX = 120;
const DEADLINE_STEP = 5;
const SPECIALISTS_MIN = 1;
const SPECIALISTS_MAX = 5;

// Pricing: 0.001 ETH base per specialist, scaled by an urgency multiplier
// that runs from 1.0 at the longest deadline to 2.0 at the shortest.
const BASE_RATE_ETH = 0.001;

function computeTotalEth(specialists: number, deadlineMinutes: number): number {
  const urgency =
    1 + (DEADLINE_MAX - deadlineMinutes) / (DEADLINE_MAX - DEADLINE_MIN);
  return Number((specialists * BASE_RATE_ETH * urgency).toFixed(4));
}

function fmtEth(n: number): string {
  return n.toFixed(4).replace(/\.?0+$/, "") || "0";
}

export function TaskCreationCard({
  initialDescription,
  initialSkills,
  initialMaxSpecialists = 3,
  onPosted,
}: {
  initialDescription: string;
  initialSkills?: string;
  initialMaxSpecialists?: number;
  onPosted?: (info: { label: string; taskId: bigint }) => void;
}) {
  const { address } = useAccount();

  const [description, setDescription] = React.useState(initialDescription);
  const skillTags = React.useMemo(
    () => initialSkills ?? suggestSkills(initialDescription),
    [initialSkills, initialDescription],
  );
  const [deadlineMinutes, setDeadlineMinutes] = React.useState(30);
  const [maxSpecialists, setMaxSpecialists] = React.useState(
    Math.min(SPECIALISTS_MAX, Math.max(SPECIALISTS_MIN, initialMaxSpecialists)),
  );
  const totalCostEth = computeTotalEth(maxSpecialists, deadlineMinutes);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: confirming,
    isSuccess: confirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash, chainId: ENS_CHAIN_ID });

  const txError = writeError || receiptError;

  const step: Step = txError
    ? "error"
    : confirmed
      ? "posted"
      : hash && confirming
        ? "confirming"
        : isPending
          ? "awaiting"
          : "editing";

  // Parse TaskPosted from the receipt to show the resulting ENS subname.
  const posted = React.useMemo(() => {
    if (!receipt) return null;
    try {
      const events = parseEventLogs({
        abi: TASK_MARKET_ABI,
        logs: receipt.logs,
        eventName: "TaskPosted",
      });
      if (events.length > 0) {
        const e = events[0];
        return {
          taskId: e.args.taskId as bigint,
          label: e.args.label as string,
          ensNode: e.args.ensNode as `0x${string}`,
        };
      }
    } catch {
      // fall through
    }
    return null;
  }, [receipt]);

  const ensName = posted ? `${posted.label}.${ENS_PARENT_DOMAIN}` : "";

  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (posted && !firedRef.current) {
      firedRef.current = true;
      onPosted?.({ label: posted.label, taskId: posted.taskId });
    }
  }, [posted, onPosted]);

  const isLocked = step !== "editing";

  const onPost = () => {
    setValidationError(null);
    if (!description.trim()) {
      setValidationError("Description is required.");
      return;
    }
    const ts = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;
    let budgetWei: bigint;
    try {
      budgetWei = parseEther(budgetEth.toString());
    } catch {
      setValidationError("Invalid budget.");
      return;
    }
    if (budgetWei <= BigInt(0)) {
      setValidationError("Budget must be greater than zero.");
      return;
    }

    writeContract({
      address: TASK_MARKET_ADDRESS,
      abi: TASK_MARKET_ABI,
      functionName: "postTask",
      args: [description.trim(), skillTags.trim(), BigInt(ts), maxSpecialists],
      value: budgetWei,
      chainId: ENS_CHAIN_ID,
    });
  };

  const headerBadge = (() => {
    switch (step) {
      case "editing":
        return <Badge variant="info">Drafting</Badge>;
      case "awaiting":
        return <Badge variant="info" dot>Awaiting signature</Badge>;
      case "confirming":
        return <Badge variant="info" dot>Confirming on Sepolia</Badge>;
      case "posted":
        return <Badge variant="success" dot>Posted</Badge>;
      case "error":
        return <Badge variant="danger" dot>Failed</Badge>;
    }
  })();

  const perSpecialist = budgetEth / maxSpecialists;
  const deadlineAt = new Date(Date.now() + deadlineMinutes * 60 * 1000);
  const deadlineLabel = deadlineAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="my-2 border border-border-strong bg-white rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border text-[12px] font-medium text-ink-2 uppercase tracking-wider">
        <Icon name="tasks" size={14} />
        Create on-chain task
        <span className="ml-auto normal-case tracking-normal">{headerBadge}</span>
      </div>

      <div className="p-3 grid gap-4">
        <div>
          <label className="block text-[11.5px] uppercase tracking-wide text-ink-3 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLocked}
            rows={2}
            className="w-full px-2.5 py-2 bg-white border border-border rounded-md text-[13px] text-ink resize-y min-h-[44px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors disabled:bg-surface-2 disabled:text-ink-2"
          />
        </div>

        <SliderRow
          label="Budget"
          value={`${fmtEth(budgetEth)} ETH`}
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={BUDGET_STEP}
          raw={budgetEth}
          onChange={setBudgetEth}
          minLabel={`${fmtEth(BUDGET_MIN)} ETH`}
          maxLabel={`${fmtEth(BUDGET_MAX)} ETH`}
          disabled={isLocked}
        />

        <SliderRow
          label="Specialists"
          value={`${maxSpecialists}`}
          min={SPECIALISTS_MIN}
          max={SPECIALISTS_MAX}
          step={1}
          raw={maxSpecialists}
          onChange={(v) => setMaxSpecialists(Math.round(v))}
          minLabel={`${SPECIALISTS_MIN}`}
          maxLabel={`${SPECIALISTS_MAX}`}
          disabled={isLocked}
        />

        <SliderRow
          label="Deadline"
          value={`${deadlineMinutes} min`}
          min={DEADLINE_MIN}
          max={DEADLINE_MAX}
          step={DEADLINE_STEP}
          raw={deadlineMinutes}
          onChange={(v) => setDeadlineMinutes(Math.round(v))}
          minLabel={`${DEADLINE_MIN} min`}
          maxLabel={`${DEADLINE_MAX} min`}
          disabled={isLocked}
          hint={`Auto-cancels around ${deadlineLabel}`}
        />

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
            <div className="text-[10.5px] uppercase tracking-wide text-ink-3">
              Total cost
            </div>
            <div className="text-[16px] font-mono font-semibold text-ink tabular-nums">
              {fmtEth(budgetEth)} ETH
            </div>
          </div>
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
            <div className="text-[10.5px] uppercase tracking-wide text-ink-3">
              Per specialist
            </div>
            <div className="text-[16px] font-mono font-semibold text-ink tabular-nums">
              {fmtEth(perSpecialist)} ETH
            </div>
          </div>
        </div>

        {validationError && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {validationError}
          </div>
        )}

        {txError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 break-words">
            {txError.message.split("\n")[0]}
          </div>
        )}

        {posted && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900 grid gap-1">
            <div className="font-medium">
              ✓ Posted as <span className="font-mono">{ensName}</span>
            </div>
            <div>
              Task id: <span className="font-mono">{posted.taskId.toString()}</span>
              {" · "}Specialists with matching skills can sign on now.
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {!address ? (
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <Button
                  variant="primary"
                  icon="arrow-up-right"
                  onClick={openConnectModal}
                  disabled={!mounted}
                >
                  Connect wallet to post
                </Button>
              )}
            </ConnectButton.Custom>
          ) : step === "posted" ? (
            <a
              href={`/tasks`}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent/90 transition-colors"
            >
              <Icon name="arrow-up-right" size={14} />
              View in marketplace
            </a>
          ) : (
            <Button
              variant="primary"
              icon="send"
              onClick={onPost}
              disabled={isLocked}
            >
              {step === "awaiting"
                ? "Sign in wallet…"
                : step === "confirming"
                  ? "Confirming…"
                  : "Post on Sepolia"}
            </Button>
          )}

          {step === "error" && (
            <Button variant="ghost" icon="refresh" onClick={reset}>
              Try again
            </Button>
          )}

          {hash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-[11.5px] font-mono text-blue-700 underline break-all"
            >
              {hash.slice(0, 10)}…{hash.slice(-8)}
            </a>
          )}
        </div>

        <div className="text-[11px] text-ink-3">
          Posts to <span className="font-mono">TaskMarket</span> on Sepolia. The
          contract escrows the budget, mints{" "}
          <span className="font-mono">task-&#123;id&#125;.{ENS_PARENT_DOMAIN}</span>,
          and writes description / budget / deadline / status as ENS text records.
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  raw,
  onChange,
  minLabel,
  maxLabel,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  raw: number;
  onChange: (v: number) => void;
  minLabel: string;
  maxLabel: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] uppercase tracking-wide text-ink-3">
          {label}
        </span>
        <span className="text-[15px] font-mono font-semibold text-ink tabular-nums">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={raw}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-1.5 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex items-center justify-between text-[10.5px] text-ink-4 font-mono">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
      {hint && <p className="text-[11px] text-ink-3 leading-tight">{hint}</p>}
    </div>
  );
}

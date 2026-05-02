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

// Default deadline = 24h from now, formatted for <input type="datetime-local">.
function default24h(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Light keyword routing — picks a few skill tags from the user's prompt so
// the right specialists in the marketplace can match. Editable in the form.
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

export function TaskCreationCard({
  initialDescription,
  initialSkills,
  initialMaxSpecialists = 3,
}: {
  initialDescription: string;
  initialSkills?: string;
  initialMaxSpecialists?: number;
}) {
  const { address } = useAccount();

  const [description, setDescription] = React.useState(initialDescription);
  const [skillTags, setSkillTags] = React.useState(
    initialSkills ?? suggestSkills(initialDescription),
  );
  const [deadline, setDeadline] = React.useState<string>(default24h);
  const [maxSpecialists, setMaxSpecialists] = React.useState(
    String(initialMaxSpecialists),
  );
  const [budget, setBudget] = React.useState("0.001");
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

  const isLocked = step !== "editing";

  const onPost = () => {
    setValidationError(null);
    if (!description.trim()) {
      setValidationError("Description is required.");
      return;
    }
    const ts = Math.floor(new Date(deadline).getTime() / 1000);
    if (!Number.isFinite(ts) || ts <= Math.floor(Date.now() / 1000)) {
      setValidationError("Deadline must be in the future.");
      return;
    }
    let budgetWei: bigint;
    try {
      budgetWei = parseEther(budget);
    } catch {
      setValidationError("Invalid budget — must be a decimal in ETH.");
      return;
    }
    if (budgetWei <= BigInt(0)) {
      setValidationError("Budget must be greater than zero.");
      return;
    }
    const max = Number(maxSpecialists);
    if (!Number.isInteger(max) || max < 1 || max > 255) {
      setValidationError("Max specialists must be an integer 1–255.");
      return;
    }

    writeContract({
      address: TASK_MARKET_ADDRESS,
      abi: TASK_MARKET_ABI,
      functionName: "postTask",
      args: [description.trim(), skillTags.trim(), BigInt(ts), max],
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

  return (
    <div className="my-2 border border-border-strong bg-white rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border text-[12px] font-medium text-ink-2 uppercase tracking-wider">
        <Icon name="tasks" size={14} />
        Create on-chain task
        <span className="ml-auto normal-case tracking-normal">{headerBadge}</span>
      </div>

      <div className="p-3 grid gap-3">
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

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11.5px] uppercase tracking-wide text-ink-3 mb-1">
              Skill tags
            </label>
            <input
              value={skillTags}
              onChange={(e) => setSkillTags(e.target.value)}
              disabled={isLocked}
              className="w-full h-[34px] px-2.5 bg-white border border-border rounded-md text-[12.5px] font-mono text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors disabled:bg-surface-2 disabled:text-ink-2"
            />
          </div>
          <div>
            <label className="block text-[11.5px] uppercase tracking-wide text-ink-3 mb-1">
              Budget (ETH)
            </label>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              disabled={isLocked}
              className="w-full h-[34px] px-2.5 bg-white border border-border rounded-md text-[12.5px] font-mono text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors disabled:bg-surface-2 disabled:text-ink-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11.5px] uppercase tracking-wide text-ink-3 mb-1">
              Deadline
            </label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={isLocked}
              className="w-full h-[34px] px-2.5 bg-white border border-border rounded-md text-[12.5px] text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors disabled:bg-surface-2 disabled:text-ink-2"
            />
          </div>
          <div>
            <label className="block text-[11.5px] uppercase tracking-wide text-ink-3 mb-1">
              Max specialists
            </label>
            <input
              value={maxSpecialists}
              onChange={(e) => setMaxSpecialists(e.target.value)}
              disabled={isLocked}
              className="w-full h-[34px] px-2.5 bg-white border border-border rounded-md text-[12.5px] font-mono text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors disabled:bg-surface-2 disabled:text-ink-2"
            />
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
          and writes description / skills / budget / deadline / status as ENS
          text records.
        </div>
      </div>
    </div>
  );
}

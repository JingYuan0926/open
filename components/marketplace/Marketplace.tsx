"use client";

import * as React from "react";
import Link from "next/link";
import { formatEther, type Address } from "viem";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TASK_STATUS } from "@/lib/abis/TaskMarket";
import { ENS_PARENT_DOMAIN } from "@/lib/networkConfig";
import {
  useSignOnTask,
  useTasks,
  type TaskWithSpecialists,
} from "@/lib/ens/TaskMarket";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatDeadline(deadline: bigint) {
  const ms = Number(deadline) * 1000;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeUntil(deadline: bigint) {
  const ms = Number(deadline) * 1000 - Date.now();
  if (ms <= 0) return "expired";
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.ceil(ms / (1000 * 60))} min left`;
  if (hours < 24) return `${Math.round(hours)} h left`;
  return `${Math.round(hours / 24)} d left`;
}

function TaskListItem({
  row,
  connectedAddress,
  onActed,
}: {
  row: TaskWithSpecialists;
  connectedAddress: Address | undefined;
  onActed: () => void;
}) {
  const { task, specialists, id } = row;
  const sign = useSignOnTask();

  React.useEffect(() => {
    if (sign.confirmed) {
      onActed();
      sign.reset();
    }
  }, [sign, onActed]);

  const isCreator =
    connectedAddress?.toLowerCase() === task.creator.toLowerCase();
  const didSignOn = connectedAddress
    ? specialists.some(
        (s) => s.toLowerCase() === connectedAddress.toLowerCase(),
      )
    : false;
  const expired = Number(task.deadline) * 1000 < Date.now();
  const isFull = specialists.length >= task.maxSpecialists;
  const canSignOn =
    !!connectedAddress && !isCreator && !didSignOn && !isFull && !expired;

  const tags = task.skillTags
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ensName = `task-${id.toString()}.${ENS_PARENT_DOMAIN}`;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-4 max-[640px]:flex-col">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <a
              href={`/api/ens/read-specialist?name=${ensName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[12.5px] text-ink-2 hover:text-ink hover:underline truncate"
              title="Read this task's ENS records"
            >
              {ensName}
            </a>
            <Badge variant="success" dot>
              open
            </Badge>
            <span className="text-[11.5px] text-ink-4 ml-auto whitespace-nowrap">
              {timeUntil(task.deadline)}
            </span>
          </div>
          <p className="text-[14px] leading-relaxed text-ink mb-2">
            {task.description}
          </p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-3 text-ink-2 text-[11.5px] font-medium border border-border"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 max-[480px]:grid-cols-1 text-[12px]">
            <Stat label="Budget" value={`${formatEther(task.budget)} USDC`} />
            <Stat label="Deadline" value={formatDeadline(task.deadline)} />
            <Stat
              label="Specialists"
              value={`${specialists.length} / ${task.maxSpecialists}`}
            />
          </div>
          <div className="text-[11.5px] text-ink-3 mt-2">
            Posted by{" "}
            <span className="font-mono text-ink-2">
              {shortAddr(task.creator)}
            </span>
            {isCreator && (
              <span className="ml-2 text-ink-4">(you posted this)</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-1.5 shrink-0 min-w-[140px] max-[640px]:w-full">
          {!connectedAddress ? (
            <Button variant="secondary" disabled>
              Connect to sign on
            </Button>
          ) : isCreator ? (
            <Badge variant="info">Your task</Badge>
          ) : didSignOn ? (
            <Badge variant="success" dot>
              You&rsquo;re signed on
            </Badge>
          ) : isFull ? (
            <Badge variant="neutral">Full</Badge>
          ) : expired ? (
            <Badge variant="warn">Expired</Badge>
          ) : (
            <Button
              variant="primary"
              icon="check"
              onClick={() => sign.run(id)}
              disabled={!canSignOn || sign.confirming}
            >
              {sign.confirming
                ? "Confirming…"
                : sign.hash
                  ? "Pending…"
                  : "Sign on"}
            </Button>
          )}
          {sign.hash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${sign.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-blue-700 underline truncate"
            >
              {sign.hash.slice(0, 8)}…{sign.hash.slice(-6)}
            </a>
          )}
        </div>
      </div>
      {sign.error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 break-words">
          {sign.error.message.split("\n")[0]}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 border border-border rounded-md px-2.5 py-1.5">
      <div className="text-[10.5px] text-ink-4 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-[12.5px] font-medium tabular-nums text-ink mt-0.5 truncate">
        {value}
      </div>
    </div>
  );
}

export function Marketplace() {
  const { address } = useAccount();
  const { tasks, isLoading, refetch } = useTasks();

  // Recompute on each render — Date.now() makes this impure for useMemo, and
  // the filter is cheap. The list is small (single-digit tasks per chain
  // realistically) so churn here doesn't matter.
  const nowMs = Date.now();
  const open = tasks.filter(
    (t) =>
      t.task.status === TASK_STATUS.Open &&
      Number(t.task.deadline) * 1000 >= nowMs,
  );

  return (
    <div className="overflow-y-auto px-8 py-6 pb-16">
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-[20px] font-medium tracking-tight m-0">
            Marketplace
          </h1>
          <p className="text-ink-3 text-[13.5px] mt-1">
            Open tasks on the ENS Task Market — every entry is a wrapped subname
            under{" "}
            <span className="font-mono">{ENS_PARENT_DOMAIN}</span> with budget
            held in escrow. Sign on if your skills match.
          </p>
        </div>
        <Button
          variant="ghost"
          icon="refresh"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="text-[14px] font-medium">Available now</div>
        <Badge variant="neutral">{open.length} open</Badge>
        {!address && (
          <Badge variant="info">Connect a wallet to sign on</Badge>
        )}
      </div>

      {isLoading && open.length === 0 ? (
        <div className="border border-dashed border-border rounded-md px-4 py-10 text-center text-[13px] text-ink-3">
          Loading on-chain tasks…
        </div>
      ) : open.length === 0 ? (
        <div className="border border-dashed border-border rounded-md px-4 py-10 text-center text-[13px] text-ink-3">
          No open tasks. Head to{" "}
          <Link href="/chat" className="text-ink underline">
            chat
          </Link>{" "}
          to post one.
        </div>
      ) : (
        <div className="grid gap-3">
          {open.map((row) => (
            <TaskListItem
              key={row.id.toString()}
              row={row}
              connectedAddress={address}
              onActed={refetch}
            />
          ))}
        </div>
      )}

      <div className="text-[11.5px] text-ink-3 mt-6 flex items-center gap-1.5">
        <Icon name="shield" size={12} />
        Reads from <span className="font-mono">TaskMarket</span> on Sepolia.
        Cancelled, completed, and expired tasks are filtered out.
      </div>
    </div>
  );
}

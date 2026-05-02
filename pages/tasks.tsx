import { useEffect, useMemo, useState } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { formatEther, parseEther, type Address } from "viem";
import { useAccount } from "wagmi";
import { Navbar } from "@/components/Navbar";
import { TASK_STATUS } from "@/lib/abis/TaskMarket";
import { ENS_PARENT_DOMAIN, TASK_MARKET_ADDRESS } from "@/lib/networkConfig";
import {
    useCancelTask,
    useCompleteTask,
    usePostTask,
    useSignOnTask,
    useTasks,
    useWithdraw,
    useWithdrawable,
    type Task,
    type TaskWithSpecialists,
} from "@/lib/ens/TaskMarket";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const STATUS_LABEL: Record<number, string> = {
    [TASK_STATUS.Open]: "Open",
    [TASK_STATUS.Completed]: "Completed",
    [TASK_STATUS.Cancelled]: "Cancelled",
};

const STATUS_CLASS: Record<number, string> = {
    [TASK_STATUS.Open]: "text-emerald-600 dark:text-emerald-400",
    [TASK_STATUS.Completed]: "text-zinc-500",
    [TASK_STATUS.Cancelled]: "text-rose-500",
};

function ExplorerLink({ hash }: { hash?: `0x${string}` }) {
    if (!hash) return null;
    return (
        <a
            href={`https://sepolia.etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-blue-600 underline break-all"
        >
            {hash.slice(0, 10)}…{hash.slice(-8)}
        </a>
    );
}

function shortAddr(a: string) {
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatDeadline(deadline: bigint) {
    const ms = Number(deadline) * 1000;
    const d = new Date(ms);
    return d.toLocaleString();
}

function defaultDeadline() {
    // tomorrow 18:00 local — used as the form placeholder
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    // datetime-local wants `YYYY-MM-DDTHH:mm`
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PostTaskForm({ onPosted }: { onPosted: () => void }) {
    const [description, setDescription] = useState("Help me set up Postgres replication");
    const [skillTags, setSkillTags] = useState("postgres-debug,linux-troubleshoot");
    const [deadline, setDeadline] = useState(defaultDeadline);
    const [maxSpecialists, setMaxSpecialists] = useState("3");
    const [budget, setBudget] = useState("0.001");

    const { post, hash, confirming, confirmed, error, reset } = usePostTask();
    const submitting = confirming || (Boolean(hash) && !confirmed && !error);

    useEffect(() => {
        if (confirmed) {
            onPosted();
            reset();
        }
    }, [confirmed, onPosted, reset]);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!description.trim()) return;
        const ts = Math.floor(new Date(deadline).getTime() / 1000);
        if (!Number.isFinite(ts) || ts <= Math.floor(Date.now() / 1000)) {
            alert("Deadline must be in the future");
            return;
        }
        let budgetWei: bigint;
        try {
            budgetWei = parseEther(budget);
        } catch {
            alert("Invalid budget");
            return;
        }
        const max = Number(maxSpecialists);
        if (!Number.isInteger(max) || max < 1 || max > 255) {
            alert("Max specialists must be 1-255");
            return;
        }
        post(description.trim(), skillTags.trim(), BigInt(ts), max, budgetWei);
    };

    return (
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
            <h2 className="font-semibold">Post a task</h2>
            <form onSubmit={onSubmit} className="space-y-3">
                <div>
                    <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">
                        Skill tags <span className="text-zinc-400 normal-case">(comma-separated, matches ENS `skills` records)</span>
                    </label>
                    <input
                        value={skillTags}
                        onChange={(e) => setSkillTags(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">Deadline</label>
                        <input
                            type="datetime-local"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">Max specialists</label>
                        <input
                            type="number"
                            min={1}
                            max={255}
                            value={maxSpecialists}
                            onChange={(e) => setMaxSpecialists(e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">Budget (ETH)</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={budget}
                            onChange={(e) => setBudget(e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={submitting || !TASK_MARKET_ADDRESS}
                    className="w-full py-2.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600 transition-colors"
                >
                    {!TASK_MARKET_ADDRESS
                        ? "Contract not deployed"
                        : submitting
                            ? "Posting…"
                            : "Post task & lock budget"}
                </button>
                {hash && (
                    <div className="text-xs">
                        Tx: <ExplorerLink hash={hash} />
                    </div>
                )}
                {error && (
                    <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                        {error.message}
                    </div>
                )}
            </form>
        </section>
    );
}

function TaskCard({
    row,
    onRefresh,
}: {
    row: TaskWithSpecialists;
    onRefresh: () => void;
}) {
    const { address } = useAccount();
    const { task, specialists, id } = row;

    const isCreator =
        address?.toLowerCase() === task.creator.toLowerCase();
    const didSignOn = useMemo(
        () =>
            address
                ? specialists.some((s) => s.toLowerCase() === address.toLowerCase())
                : false,
        [specialists, address],
    );
    const expired = Number(task.deadline) * 1000 < Date.now();
    const isOpen = task.status === TASK_STATUS.Open;
    const isFull = specialists.length >= task.maxSpecialists;

    const canSignOn = isOpen && !didSignOn && !isFull && !expired && !!address && !isCreator;
    const canComplete = isOpen && isCreator && specialists.length > 0;
    const canCancel = isOpen && isCreator && specialists.length === 0;

    const sign = useSignOnTask();
    const complete = useCompleteTask();
    const cancel = useCancelTask();

    const busy = sign.confirming || complete.confirming || cancel.confirming;

    useEffect(() => {
        if (sign.confirmed || complete.confirmed || cancel.confirmed) {
            onRefresh();
            sign.reset();
            complete.reset();
            cancel.reset();
        }
    }, [sign, complete, cancel, onRefresh]);

    const tags = task.skillTags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const actionError = sign.error || complete.error || cancel.error;
    const actionHash = sign.hash || complete.hash || cancel.hash;

    return (
        <article className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span className="font-mono">#{id.toString()}</span>
                        <span className="h-1 w-1 rounded-full bg-zinc-400" />
                        <span className={STATUS_CLASS[task.status]}>{STATUS_LABEL[task.status]}</span>
                        {expired && isOpen && (
                            <>
                                <span className="h-1 w-1 rounded-full bg-zinc-400" />
                                <span className="text-amber-600">expired</span>
                            </>
                        )}
                    </div>
                    <a
                        href={`/api/ens/read-specialist?name=task-${id.toString()}.${ENS_PARENT_DOMAIN}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block font-mono text-xs text-blue-600 hover:underline break-all"
                        title="Read this task's ENS records"
                    >
                        task-{id.toString()}.{ENS_PARENT_DOMAIN}
                    </a>
                    <p className="mt-1 text-sm">{task.description}</p>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-base font-semibold">{formatEther(task.budget)} ETH</div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                        budget locked
                    </div>
                </div>
            </header>

            {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                        <span
                            key={t}
                            className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono text-zinc-600 dark:text-zinc-300"
                        >
                            {t}
                        </span>
                    ))}
                </div>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-y-1 gap-x-4 text-xs">
                <dt className="text-zinc-500">Creator</dt>
                <dd className="font-mono break-all">{shortAddr(task.creator)}</dd>
                <dt className="text-zinc-500">Deadline</dt>
                <dd>{formatDeadline(task.deadline)}</dd>
                <dt className="text-zinc-500">Slots</dt>
                <dd>
                    {specialists.length} / {task.maxSpecialists} signed on
                </dd>
            </dl>

            {specialists.length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Signed on
                    </div>
                    <ul className="space-y-0.5">
                        {specialists.map((s) => (
                            <li key={s} className="text-xs font-mono">
                                {shortAddr(s)}
                                {address?.toLowerCase() === s.toLowerCase() && (
                                    <span className="ml-2 text-emerald-600 dark:text-emerald-400">you</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
                {canSignOn && (
                    <button
                        onClick={() => sign.run(id)}
                        disabled={busy}
                        className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50"
                    >
                        Sign on
                    </button>
                )}
                {canComplete && (
                    <button
                        onClick={() => complete.run(id)}
                        disabled={busy}
                        className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-50"
                    >
                        Complete & split budget
                    </button>
                )}
                {canCancel && (
                    <button
                        onClick={() => cancel.run(id)}
                        disabled={busy}
                        className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium disabled:opacity-50"
                    >
                        Cancel
                    </button>
                )}
                {didSignOn && isOpen && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ you've signed on</span>
                )}
                {isCreator && task.status === TASK_STATUS.Completed && (
                    <span className="text-xs text-zinc-500">paid out — specialists can withdraw</span>
                )}
                {actionHash && <ExplorerLink hash={actionHash} />}
            </div>

            {actionError && (
                <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
                    {actionError.message.split("\n")[0]}
                </div>
            )}
        </article>
    );
}

function WithdrawCard() {
    const { address } = useAccount();
    const { data: balance, refetch } = useWithdrawable(address);
    const { withdraw, hash, confirming, confirmed, error, reset } = useWithdraw();

    useEffect(() => {
        if (confirmed) {
            refetch();
            reset();
        }
    }, [confirmed, refetch, reset]);

    if (!address) return null;
    const bal = (balance as bigint | undefined) ?? BigInt(0);
    if (bal === BigInt(0)) return null;

    return (
        <section className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 flex items-center justify-between gap-3">
            <div>
                <div className="text-xs text-zinc-500">Withdrawable balance</div>
                <div className="text-lg font-semibold">{formatEther(bal)} ETH</div>
            </div>
            <div className="flex items-center gap-3">
                {hash && <ExplorerLink hash={hash} />}
                <button
                    onClick={() => withdraw()}
                    disabled={confirming}
                    className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
                >
                    {confirming ? "Withdrawing…" : "Withdraw"}
                </button>
            </div>
            {error && (
                <p className="text-xs text-red-600">{error.message.split("\n")[0]}</p>
            )}
        </section>
    );
}

export default function TasksPage() {
    const { tasks, isLoading, refetch } = useTasks();

    return (
        <div
            className={`${geistSans.className} ${geistMono.variable} min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
        >
            <Navbar />
            <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
                <header className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">Task Market</h1>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Post a goal with a budget locked in escrow. Each task is also a
                        wrapped ENS subname{" "}
                        <span className="font-mono">task-&#123;id&#125;.{ENS_PARENT_DOMAIN}</span>{" "}
                        with text records (description, skills, budget, deadline, status).
                        Specialists sign on on-chain; when you complete, the budget splits
                        equally among everyone signed on. They withdraw individually.
                    </p>
                    {!TASK_MARKET_ADDRESS && (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                            TaskMarket contract not deployed yet. Deploy{" "}
                            <code className={geistMono.className}>contracts/ignition/modules/TaskMarket.ts</code>{" "}
                            and set{" "}
                            <code className={geistMono.className}>TASK_MARKET_ADDRESS</code> in{" "}
                            <code className={geistMono.className}>lib/networkConfig.ts</code>.
                        </p>
                    )}
                </header>

                <WithdrawCard />

                <PostTaskForm onPosted={refetch} />

                <section className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold">All tasks</h2>
                        <button
                            onClick={refetch}
                            className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            Refresh
                        </button>
                    </div>
                    {isLoading && tasks.length === 0 && (
                        <p className="text-sm text-zinc-500">Loading…</p>
                    )}
                    {!isLoading && tasks.length === 0 && (
                        <p className="text-sm text-zinc-500">
                            No tasks yet. Post the first one above.
                        </p>
                    )}
                    {tasks.map((row) => (
                        <TaskCard key={row.id.toString()} row={row} onRefresh={refetch} />
                    ))}
                </section>
            </main>
        </div>
    );
}

// Suppress unused-imports complaint for re-exported types in some toolchains.
export type _Task = Task;
export type _Address = Address;

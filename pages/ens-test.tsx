import { useEffect, useMemo, useState } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import { useParentStatus } from '@/lib/ens/useParentStatus';
import { useRegisterSpecialist } from '@/lib/ens/useRegisterSpecialist';
import type { SpecialistRecords } from '@/lib/networkConfig';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

type ReadResult = {
    fullName: string;
    node: string;
    isWrapped: boolean;
    owner: string | null;
    records: SpecialistRecords;
};

const DEFAULT_RECORDS: SpecialistRecords = {
    axlPubkey: '0x' + '00'.repeat(32),
    skills: 'postgres-debug,linux-troubleshoot',
    workspaceUri: '0g://workspace/example',
    tokenId: '1',
    price: '0.05',
    version: '0.1.0',
};

function ExplorerLink({ hash, label }: { hash: string; label?: string }) {
    if (!hash || hash === '0x') return null;
    return (
        <a
            href={`https://sepolia.etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline font-mono text-xs break-all"
        >
            {label ? `${label}: ` : ''}
            {hash.slice(0, 10)}…{hash.slice(-8)}
        </a>
    );
}

function StepLabel({ step }: { step: ReturnType<typeof useRegisterSpecialist>['step'] }) {
    const map: Record<typeof step, string> = {
        idle: '',
        minting: 'Waiting for mint signature…',
        mintConfirming: 'Waiting for mint to confirm…',
        writingRecords: 'Waiting for records signature…',
        recordsConfirming: 'Waiting for records to confirm…',
        success: '✓ Registered',
        error: 'Error',
    };
    if (!map[step]) return null;
    return <p className="text-xs text-zinc-500">{map[step]}</p>;
}

export default function EnsTestPage() {
    const status = useParentStatus();

    const [label, setLabel] = useState('test-specialist');
    const [records, setRecords] = useState<SpecialistRecords>(DEFAULT_RECORDS);

    const {
        step,
        error: registerError,
        result: registerResult,
        mintHash,
        recordsHash,
        register,
        reset,
        isBusy,
    } = useRegisterSpecialist();

    const [readName, setReadName] = useState('');
    const [reading, setReading] = useState(false);
    const [readResult, setReadResult] = useState<ReadResult | null>(null);
    const [readError, setReadError] = useState<string | null>(null);

    const fullName = useMemo(
        () => (label ? `${label}.${status.parentDomain}` : ''),
        [label, status.parentDomain],
    );
    const validLabel = /^[a-z0-9-]{3,63}$/.test(label);

    // Auto-fill the read field once registration succeeds
    useEffect(() => {
        if (registerResult) setReadName(registerResult.fullName);
    }, [registerResult]);

    const onRegister = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validLabel) return;
        register(label, records);
    };

    const onRead = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!readName) return;
        setReading(true);
        setReadError(null);
        setReadResult(null);
        try {
            const r = await fetch(`/api/ens/read-specialist?name=${encodeURIComponent(readName)}`);
            const j = await r.json();
            if (!j.success) throw new Error(j.error ?? 'unknown error');
            setReadResult(j.result);
        } catch (e) {
            setReadError(e instanceof Error ? e.message : String(e));
        } finally {
            setReading(false);
        }
    };

    return (
        <div
            className={`${geistSans.className} ${geistMono.variable} min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
        >
            <Navbar />
            <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-10">
                <header className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">ENS Specialist Registry — Sepolia</h1>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Connect a wallet that owns (or is an approved operator of) the parent
                        domain and register a specialist subname. The connected wallet signs
                        both transactions and becomes the owner of the new subname.
                    </p>
                </header>

                {/* Connected-wallet panel */}
                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
                    <h2 className="font-semibold">Parent ownership</h2>
                    <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-y-1 gap-x-4 text-sm">
                        <dt className="text-zinc-500">Connected wallet</dt>
                        <dd className="font-mono break-all">{status.connectedAddress ?? '—'}</dd>
                        <dt className="text-zinc-500">Parent domain</dt>
                        <dd className="font-mono">{status.parentDomain}</dd>
                        <dt className="text-zinc-500">Wrapped?</dt>
                        <dd>{status.isLoading ? '…' : status.isWrapped ? 'yes' : 'no'}</dd>
                        <dt className="text-zinc-500">Parent owner</dt>
                        <dd className="font-mono break-all">{status.parentOwner ?? '—'}</dd>
                        <dt className="text-zinc-500">Can register?</dt>
                        <dd>
                            {status.isLoading ? (
                                '…'
                            ) : status.canRegister ? (
                                <span className="text-green-600 dark:text-green-400">yes</span>
                            ) : (
                                <span className="text-amber-600 dark:text-amber-400">
                                    no — {status.reason}
                                </span>
                            )}
                        </dd>
                    </dl>
                </section>

                {/* Register form */}
                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
                    <h2 className="font-semibold">Register a specialist subname</h2>
                    <form onSubmit={onRegister} className="space-y-4">
                        <div>
                            <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">Label</label>
                            <div className="flex">
                                <input
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value.toLowerCase())}
                                    className="flex-1 px-3 py-2 rounded-l-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="postgres-debug"
                                />
                                <span className="px-3 py-2 rounded-r-md border border-l-0 border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-sm">
                                    .{status.parentDomain}
                                </span>
                            </div>
                            {label && !validLabel && (
                                <p className="mt-1 text-xs text-red-600">3–63 chars, lowercase letters / digits / hyphens.</p>
                            )}
                            {fullName && validLabel && (
                                <p className="mt-1 text-xs text-zinc-500">
                                    Full name: <span className="font-mono">{fullName}</span>
                                    {status.connectedAddress && (
                                        <>
                                            {' '}
                                            · owner will be{' '}
                                            <span className="font-mono">{status.connectedAddress}</span>
                                        </>
                                    )}
                                </p>
                            )}
                        </div>

                        <fieldset className="space-y-3">
                            <legend className="text-xs uppercase tracking-wide text-zinc-500">Text records</legend>
                            {(Object.keys(records) as Array<keyof SpecialistRecords>).map((key) => (
                                <div key={key}>
                                    <label className="block text-xs text-zinc-500 mb-1">{key}</label>
                                    <input
                                        value={records[key]}
                                        onChange={(e) => setRecords({ ...records, [key]: e.target.value })}
                                        className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            ))}
                        </fieldset>

                        <div className="flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={!validLabel || isBusy || !status.canRegister}
                                className="flex-1 py-2.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600 transition-colors"
                            >
                                {isBusy ? 'Working…' : 'Register specialist'}
                            </button>
                            {(step === 'success' || step === 'error') && (
                                <button
                                    type="button"
                                    onClick={reset}
                                    className="px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                                >
                                    Reset
                                </button>
                            )}
                        </div>

                        <StepLabel step={step} />

                        {(mintHash || recordsHash) && (
                            <div className="space-y-1 text-sm">
                                {mintHash && <ExplorerLink hash={mintHash} label="mint tx" />}
                                {recordsHash && <ExplorerLink hash={recordsHash} label="records tx" />}
                            </div>
                        )}

                        {registerError && (
                            <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                                {registerError.message}
                            </div>
                        )}

                        {registerResult && (
                            <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/30 p-3 text-sm space-y-1.5">
                                <p className="font-medium text-green-800 dark:text-green-300">
                                    ✓ {registerResult.fullName} registered
                                </p>
                                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                    Owner: <span className="font-mono">{registerResult.owner}</span>
                                </p>
                            </div>
                        )}
                    </form>
                </section>

                {/* Read form */}
                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
                    <h2 className="font-semibold">Read a specialist&apos;s records</h2>
                    <form onSubmit={onRead} className="space-y-3">
                        <div className="flex gap-2">
                            <input
                                value={readName}
                                onChange={(e) => setReadName(e.target.value)}
                                placeholder={`postgres-debug.${status.parentDomain}`}
                                className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                type="submit"
                                disabled={!readName || reading}
                                className="px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 disabled:opacity-40"
                            >
                                {reading ? 'Reading…' : 'Read'}
                            </button>
                        </div>
                    </form>

                    {readError && (
                        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                            {readError}
                        </div>
                    )}

                    {readResult && (
                        <div className="space-y-2 text-sm">
                            <dl className="grid grid-cols-[140px_1fr] gap-y-1 gap-x-4">
                                <dt className="text-zinc-500">Wrapped?</dt>
                                <dd>{readResult.isWrapped ? 'yes' : 'no'}</dd>
                                <dt className="text-zinc-500">Owner</dt>
                                <dd className="font-mono break-all">{readResult.owner ?? '—'}</dd>
                            </dl>
                            <details open className="mt-2">
                                <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">
                                    Text records
                                </summary>
                                <dl className="grid grid-cols-[140px_1fr] gap-y-1 gap-x-4 mt-2">
                                    {(Object.keys(readResult.records) as Array<keyof SpecialistRecords>).map((k) => (
                                        <div key={k} className="contents">
                                            <dt className="text-zinc-500 font-mono text-xs">{k}</dt>
                                            <dd className="font-mono text-xs break-all">
                                                {readResult.records[k] || <span className="text-zinc-400">—</span>}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </details>
                        </div>
                    )}
                </section>

                <footer className="text-xs text-zinc-500 space-y-1">
                    <p>
                        Network: Sepolia · NameWrapper: 0x0635…fCe8 · Public Resolver: 0xE996…E9b5
                    </p>
                    <p>
                        Set{' '}
                        <code className={geistMono.className}>NEXT_PUBLIC_ENS_PARENT_DOMAIN</code>{' '}
                        in <code className={geistMono.className}>.env.local</code>.
                    </p>
                </footer>
            </main>
        </div>
    );
}
